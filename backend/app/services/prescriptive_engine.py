"""
CONTEXT: Prescriptive Engine - RAG system for generating heat action plans.
NEIGHBORHOOD:
    - Imported by: app/api/routes.py
    - Imports from: app/core/config.py, chromadb, langchain

PURPOSE: Manages the vector database (ChromaDB) and generates prescriptive advice
using retrieved context and (optionally) an LLM.
"""

import os
import asyncio
from typing import List, Dict, Any, Optional
from functools import wraps

from app.core.config import get_settings
from app.schemas.models import SourceDocument

# Lazy imports for heavy libraries - imported on first use in _initialize_components
chromadb = None
embedding_functions = None
ChatMistralAI = None
ChatPromptTemplate = None
StrOutputParser = None


def async_retry_with_backoff(max_retries=3, base_delay=2):
    """
    Decorator for async functions with exponential backoff retry logic.
    Retries on failure with delays: 2s, 4s, 8s (for max_retries=3)
    """

    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            last_exception = None
            for attempt in range(max_retries):
                try:
                    return await func(*args, **kwargs)
                except Exception as e:
                    last_exception = e
                    error_str = str(e).lower()
                    # Check if it's a rate limit error
                    is_rate_limit = any(
                        x in error_str for x in ["rate limit", "too many", "429"]
                    )

                    if attempt < max_retries - 1:
                        delay = base_delay * (2**attempt)  # 2s, 4s, 8s
                        if is_rate_limit:
                            print(
                                f"[Retry] Rate limit hit, waiting {delay}s before retry {attempt + 1}/{max_retries}..."
                            )
                        else:
                            print(
                                f"[Retry] Attempt {attempt + 1} failed, retrying in {delay}s..."
                            )
                        await asyncio.sleep(delay)
                    else:
                        print(f"[Retry] All {max_retries} attempts failed.")
            raise last_exception

        return wrapper

    return decorator


class PrescriptiveEngine:
    """
    PURPOSE: RAG engine for retrieving and synthesizing heat action protocols.

    RELATIONSHIPS:
        - Manages a persistent ChromaDB client.
        - Uses Mistral AI (via LangChain) for answer synthesis if API key is present.
        - Fallbacks to rule-based retrieval if no LLM.

    CONSUMERS: analyze_district() in routes.py
    """

    _instance: Optional["PrescriptiveEngine"] = None
    _initialized: bool = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if PrescriptiveEngine._initialized:
            return

        self.settings = get_settings()
        self.chroma_client = None
        self.collection = None
        self.llm = None
        self.embedding_fn = None
        self._components_initialized = False

        PrescriptiveEngine._initialized = True

    def _ensure_initialized(self):
        """Lazy initialize components on first use."""
        if not self._components_initialized:
            self._initialize_components()
            self._components_initialized = True

    def is_initialized(self) -> bool:
        """Check if components are initialized without triggering initialization."""
        return self._components_initialized

    def _initialize_components(self):
        """Initialize ChromaDB and LLM components."""
        global \
            chromadb, \
            embedding_functions, \
            ChatMistralAI, \
            ChatPromptTemplate, \
            StrOutputParser

        # Lazy import heavy libraries
        if chromadb is None:
            import chromadb as _chromadb
            from chromadb.utils import embedding_functions as _embedding_functions

            chromadb = _chromadb
            embedding_functions = _embedding_functions

        if ChatMistralAI is None:
            from langchain_mistralai import ChatMistralAI as _ChatMistralAI
            from langchain_core.prompts import ChatPromptTemplate as _ChatPromptTemplate
            from langchain_core.output_parsers import (
                StrOutputParser as _StrOutputParser,
            )

            ChatMistralAI = _ChatMistralAI
            ChatPromptTemplate = _ChatPromptTemplate
            StrOutputParser = _StrOutputParser

        try:
            # 1. Setup ChromaDB (Local Persistent)
            persist_dir = self.settings.chroma_persist_dir
            if not os.path.exists(persist_dir):
                os.makedirs(persist_dir, exist_ok=True)

            self.chroma_client = chromadb.PersistentClient(path=persist_dir)

            # 2. Setup Embedding Function (using all-MiniLM-L6-v2 for speed/quality balance)
            print(
                "[PrescriptiveEngine] Loading Embedding Model (this may download on first run)..."
            )
            self.embedding_fn = (
                embedding_functions.SentenceTransformerEmbeddingFunction(
                    model_name="all-MiniLM-L6-v2"
                )
            )

            # 3. Get or Create Collection
            self.collection = self.chroma_client.get_or_create_collection(
                name=self.settings.chroma_collection_name,
                embedding_function=self.embedding_fn,
            )
            print(f"[PrescriptiveEngine] Connected to ChromaDB at {persist_dir}")

            # 4. Setup LLM (Mistral/Codestral)
            if (
                self.settings.mistral_api_key
                and self.settings.mistral_api_key != "your_mistral_api_key_here"
            ):
                # Support custom endpoints (e.g., Codestral: https://codestral.mistral.ai/v1)
                llm_kwargs = {
                    "mistral_api_key": self.settings.mistral_api_key,
                    "model": self.settings.mistral_model,
                }
                if self.settings.mistral_api_url:
                    llm_kwargs["endpoint"] = self.settings.mistral_api_url

                self.llm = ChatMistralAI(**llm_kwargs)
                print(
                    f"[PrescriptiveEngine] LLM initialized: {self.settings.mistral_model} ({self.settings.mistral_api_url or 'default'})"
                )
            else:
                print(
                    "[PrescriptiveEngine] No Mistral API key found. Running in Retrieval-Only mode."
                )

        except Exception as e:
            print(f"[PrescriptiveEngine] Critical Error initializing: {e}")
            raise e

    def add_document(self, content: str, metadata: Dict[str, Any], doc_id: str) -> bool:
        """
        PURPOSE: Index a new document into ChromaDB.
        """
        self._ensure_initialized()
        try:
            self.collection.add(documents=[content], metadatas=[metadata], ids=[doc_id])
            return True
        except Exception as e:
            print(f"[PrescriptiveEngine] Error adding document: {e}")
            return False

    def delete_document(self, filename: str) -> bool:
        """
        PURPOSE: Remove all chunks associated with a specific file from ChromaDB.
        """
        self._ensure_initialized()
        try:
            # Delete where metadata 'source' matches filename
            self.collection.delete(where={"source": filename})
            return True
        except Exception as e:
            print(f"[PrescriptiveEngine] Error deleting document {filename}: {e}")
            return False

    def get_all_document_sources(self) -> List[Dict[str, Any]]:
        """
        PURPOSE: Get all unique document sources from ChromaDB.
        This helps sync the UI with documents that exist in ChromaDB but not in the database.
        """
        self._ensure_initialized()
        try:
            # Get all documents from collection (limit 10000)
            results = self.collection.get(limit=10000)

            # Extract unique sources from metadata
            sources = {}
            if results["metadatas"]:
                for meta in results["metadatas"]:
                    source = meta.get("source", "Unknown")
                    if source not in sources:
                        sources[source] = {
                            "filename": source,
                            "chunk_count": 0,
                            "pages": set(),
                        }
                    sources[source]["chunk_count"] += 1
                    if meta.get("page"):
                        sources[source]["pages"].add(meta["page"])

            # Convert to list
            result_list = []
            for source, data in sources.items():
                result_list.append(
                    {
                        "filename": data["filename"],
                        "chunk_count": data["chunk_count"],
                        "pages": sorted(list(data["pages"])) if data["pages"] else None,
                    }
                )

            return result_list
        except Exception as e:
            print(f"[PrescriptiveEngine] Error getting document sources: {e}")
            return []

    def query_protocols(
        self, query_text: str, n_results: int = 3
    ) -> List[SourceDocument]:
        """
        PURPOSE: Retrieve relevant documents from ChromaDB based on semantic similarity.
        """
        self._ensure_initialized()
        try:
            results = self.collection.query(
                query_texts=[query_text], n_results=n_results
            )

            documents = []
            if results["documents"]:
                for i, doc_text in enumerate(results["documents"][0]):
                    meta = results["metadatas"][0][i] if results["metadatas"] else {}
                    # Cosine distance to similarity score conversion (approx)
                    distance = results["distances"][0][i] if results["distances"] else 0
                    similarity = 1 - min(distance, 1.0)

                    documents.append(
                        SourceDocument(
                            content=doc_text,
                            source=meta.get("source", "Unknown"),
                            page=meta.get("page", None),
                            similarity_score=round(similarity, 3),
                        )
                    )

            return documents
        except Exception as e:
            print(f"[PrescriptiveEngine] Error querying protocols: {e}")
            return []

    @async_retry_with_backoff(max_retries=3, base_delay=2)
    async def _llm_invoke_with_retry(self, messages):
        """Wrapper for LLM calls with exponential backoff retry logic."""
        if not self.llm:
            raise Exception("LLM not initialized")
        return await self.llm.ainvoke(messages)

    async def chat_rag(
        self, user_query: str, district_context: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        PURPOSE: General QA against the RAG knowledge base.
        """
        self._ensure_initialized()
        # 1. Retrieve Context
        context_docs = self.query_protocols(user_query, n_results=3)
        context_parts = []
        for d in context_docs:
            context_parts.append(f"Source ({d.source}): {d.content}")
        context_str = "\n\n".join(context_parts)

        # 2. LLM Synthesis
        answer = ""
        used_llm = False

        if self.llm:
            try:
                extra_context_block = ""
                if district_context and district_context.strip():
                    extra_context_block = (
                        "\n\nAdditional District Analysis Context (from the app UI):\n"
                        f"{district_context.strip()}"
                    )

                system_prompt = (
                    "You are a helpful assistant for the HeatGuard AI system.\n"
                    "Use the following pieces of retrieved context to answer the user's question.\n"
                    "If provided, use the additional district analysis context to ground the answer.\n"
                    "If the answer is not in the context, say that you don't know based on the available documents.\n"
                    "Keep the answer concise and helpful.\n\n"
                    "Context:\n{context}"
                    "{extra_context}"
                )
                messages = [
                    (
                        "system",
                        system_prompt.format(
                            context=context_str, extra_context=extra_context_block
                        ),
                    ),
                    ("user", user_query),
                ]

                response = await self._llm_invoke_with_retry(messages)
                answer = response.content
                used_llm = True
            except Exception as e:
                print(f"Chat LLM failed after retries: {e}")
                answer = "I encountered an error processing your request with the AI model (rate limit exceeded)."

        if not used_llm:
            # 3. Fallback without LLM
            if context_docs:
                answer = f"**Knowledge Base Match:**\n\n> {context_docs[0].content}\n\n*(LLM not connected, showing raw context)*"
            else:
                answer = "No relevant information found in the knowledge base."

        return {
            "answer": answer,
            "context": [d.dict() for d in context_docs],
            "reasoning": (
                f"Query Analysis: '{user_query}'\n"
                f"District Context Provided: {bool(district_context and district_context.strip())}\n"
                "Retrieval Strategy: Vector Similarity (Top-3)\n"
                f"Context Found: {len(context_docs)} documents.\n"
                f"Synthesis Model: {'Mistral AI' if used_llm else 'Fallback Rules'}"
            ),
        }

    async def generate_prescriptive_advice(
        self,
        risk_level: str,
        district_name: str,
        heat_index: float,
        context_docs: List[SourceDocument],
    ) -> str:
        """
        PURPOSE: Synthesize actionable advice using LLM or Fallback logic.

        Logic Flow:
        1. IF LLM is available:
           - Construct a prompt with Risk Level, District, and Retrieved Context.
           - Ask for 3 bullet points of specific interventions.
        2. IF NO LLM:
           - Return a static template based on Risk Level + Top Context snippet.
        """
        self._ensure_initialized()

        # Prepare context string
        context_str = "\n\n".join(
            [f"Source ({d.source}): {d.content}" for d in context_docs]
        )

        # --- LLM PATH ---
        if self.llm:
            try:
                prompt_template = """
                You are an expert Heat Action Plan advisor for the government of India.

                Current Situation:
                - District: {district}
                - Heat Index: {heat_index}┬░C
                - Risk Status: {risk_level} (Red=Critical, Amber=Severe, Green=Normal)

                Relevant Protocols (from knowledge base):
                {context}

                Task:
                Provide 3 specific, actionable, and high-priority interventions for local authorities based *strictly* on the protocols above.
                Focus on immediate relief operations. Format as a markdown list.
                """

                prompt = ChatPromptTemplate.from_template(prompt_template)
                chain = prompt | self.llm | StrOutputParser()

                # Wrap chain invocation with retry logic
                @async_retry_with_backoff(max_retries=3, base_delay=2)
                async def invoke_chain():
                    return await chain.ainvoke(
                        {
                            "district": district_name,
                            "heat_index": heat_index,
                            "risk_level": risk_level,
                            "context": context_str,
                        }
                    )

                response = await invoke_chain()
                return response

            except Exception as e:
                print(
                    f"[PrescriptiveEngine] LLM Generation failed after retries: {e}. Falling back to rule-based."
                )

        # --- FALLBACK PATH (Rule-based) ---
        default_advice = ""
        if risk_level == "Red":
            default_advice = (
                f"ΓÜá∩╕Å **CRITICAL HEAT ALERT FOR {district_name.upper()}**\n\n"
                "Based on the analysis, immediate 'Level 3' interventions are required:\n"
                "1. **Cooling Centers**: Activate all designated cooling shelters immediately.\n"
                "2. **Medical Readiness**: Put district hospitals on high alert for heatstroke cases.\n"
                "3. **Public Advisory**: Issue 'Do Not Venture Outdoors' warning between 12 PM - 4 PM.\n\n"
                "*Protocol Reference:*"
            )
        elif risk_level == "Amber":
            default_advice = (
                f"ΓÜá∩╕Å **SEVERE HEAT WARNING FOR {district_name.upper()}**\n\n"
                "Precautionary 'Level 2' measures are recommended:\n"
                "1. **Hydration Points**: Set up drinking water kiosks in high-traffic areas.\n"
                "2. **School Timings**: Consider reducing school hours to end by 11:00 AM.\n"
                "3. **Worker Safety**: Ensure frequent rest breaks for outdoor laborers.\n\n"
                "*Protocol Reference:*"
            )
        else:
            default_advice = (
                f"Γ£à **NORMAL MONITORING FOR {district_name.upper()}**\n\n"
                "Routine 'Level 1' surveillance is sufficient:\n"
                "1. **Awareness**: Continue public awareness campaigns on hydration.\n"
                "2. **Monitoring**: Keep tracking daily temperature and humidity trends.\n\n"
                "*Protocol Reference:*"
            )

        # Append top context if available
        if context_docs:
            default_advice += f"\n> {context_docs[0].content[:200]}..."

        return default_advice


# Global instance
prescriptive_engine = PrescriptiveEngine()
