import torch
print(f"Torch version: {torch.__version__}")
try:
    x = torch.rand(5, 3)
    print(x)
    print("Torch works!")
except Exception as e:
    print(f"Torch error: {e}")
