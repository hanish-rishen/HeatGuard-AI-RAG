# HeatGuard AI - Full Optimization Implementation Plan

## Target Performance
- First load (cold cache): 2-4 seconds (down from 2-3 minutes)
- Daily active user: <1 second (pre-computed data)
- Weather API calls/day: 13 (98% reduction from 640×users)
- DB transactions: 1 per request (99.8% reduction)

## Implementation Phases

### Phase 1: Core Backend Optimizations
**Files to modify:**
1. `backend/app/services/db_manager.py` - Add bulk insert method
2. `backend/app/services/data_fetcher.py` - Batch weather API + caching
3. `backend/app/services/predictive_engine.py` - Async batch predictions

**Expected time:** 2-3 hours

### Phase 2: Rankings Endpoint Refactor
**Files to modify:**
1. `backend/app/api/routes.py` - Priority loading, progress tracking

**Expected time:** 2-3 hours

### Phase 3: Daily Cron Job
**New files:**
1. `backend/app/cron/daily_rankings.py` - Cron job script
2. Configure in Leapcell dashboard

**Expected time:** 1 hour

### Phase 4: Testing & Validation
**New files:**
1. `backend/benchmarks/test_rankings.py` - Performance benchmarks

**Expected time:** 1-2 hours

## Configuration Settings
- Batch size: 50 districts per weather API call
- Weather sharing radius: 25km (region-based caching)
- Cache TTL: 1 hour
- Max concurrency: 30 (Leapcell limit)
- Priority loading: Yes (high-risk districts first)
- Cron schedule: 5:00 AM IST daily

## Resource Usage (Leapcell Free Tier)
- CPU: 2.5 vCPUs peak (limit: 3) ✅
- Memory: ~1.5GB peak (limit: 4GB) ✅
- Request timeout: 2-4 seconds (limit: 15 min) ✅
- Concurrent invocations: 30 max (limit: 30) ✅
- Service invocations: ~20K/month (limit: 100K) ✅
- Async tasks: 30/month (limit: 10K) ✅

## Risk Mitigation
- Open-Meteo rate limiting: Batch calls reduce by 98%
- Memory overflow: Process in batches of 50
- CPU throttling: Semaphore at 30 concurrent
- SQLite locking: Single bulk transaction
- Cron failure: Add monitoring and alerts
- Cache staleness: 1-hour TTL, force refresh available

## Success Metrics
- [ ] First load <5 seconds
- [ ] Daily users <1 second
- [ ] Weather API calls 13/day
- [ ] CPU usage <80%
- [ ] Memory usage <2GB
- [ ] Zero timeout errors

## Deployment Steps
1. Local testing (all phases)
2. Deploy Phase 1 to Leapcell
3. Verify weather batching works
4. Deploy Phase 2 (rankings endpoint)
5. Add cron job (Phase 3)
6. Monitor for 24 hours
7. Deploy frontend updates

## Rollback Plan
If issues arise:
1. Reduce batch size from 50 to 25
2. Reduce concurrency from 30 to 15
3. Disable priority loading
4. Fall back to old implementation

## Notes
- Keep old code commented for quick rollback
- Monitor Leapcell logs during deployment
- Test with 10 concurrent users before full release
