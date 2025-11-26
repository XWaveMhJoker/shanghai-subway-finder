# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Shanghai Subway Finder (上海地铁中间站查找器) is a pure vanilla JavaScript web application that finds optimal meeting points between two locations using Shanghai's subway system. The app calculates and ranks subway stations based on balanced travel times from both locations.

## Commands

### Development
```bash
# Serve locally (Python)
python -m http.server 8000

# Serve locally (Node.js)
npx http-server

# Then open http://localhost:8000
```

No build process or dependencies required - open `index.html` directly in a browser.

## Configuration

**CRITICAL**: The app requires two pieces of configuration from AMap (高德地图):

1. **API Key**: Must be configured in TWO places:
   - `index.html` line 24: `<script src="https://webapi.amap.com/maps?v=2.0&key=YOUR_KEY">`
   - `js/config.js` line 13: `AMAP_KEY: 'YOUR_KEY'`

2. **Security JS Code**: Must be configured in ONE place:
   - `index.html` lines 18-20: `window._AMapSecurityConfig = { securityJsCode: 'YOUR_CODE' }`

**Important**: The API Key must be a "Web 端（JS API）" type, NOT "Web 服务" type.

## Architecture

### Core Algorithm Flow

The application implements a 6-step intelligent station finding algorithm:

1. **Geocoding** (`gaodeApi.js:79-98`): Convert address strings to coordinates
   - Primary: Uses AMap.Geocoder
   - Fallback: Uses AMap.PlaceSearch if Geocoder fails/times out

2. **Route Extraction** (`gaodeApi.js:193-298`): Get main transit route from start to end
   - Extracts all subway stations along the route
   - Uses AMap.Transfer with LEAST_TIME policy

3. **Candidate Station Extraction** (`stationFinder.js:87-146`): Three-strategy approach
   - Strategy 1: Stations from the main route
   - Strategy 2: Stations near geographic midpoint (SEARCH_RADIUS: 3000m)
   - Strategy 3: Stations near start/end points (2000m radius)
   - Limits to MAX_CANDIDATES (10) to avoid API QPS limits

4. **Travel Time Calculation** (`stationFinder.js:152-211`): Calculate times from each candidate
   - Batch processing (2 stations at a time) with delays to avoid rate limiting
   - 800ms delay between batches, 300ms between individual requests
   - Random 100-200ms jitter to prevent request clustering

5. **Scoring & Ranking** (`stationFinder.js:220-239`):
   ```
   score = max(timeFromStart, timeToEnd) + abs(timeFromStart - timeToEnd) × BALANCE_WEIGHT
   ```
   - Minimizes longest wait time
   - Balances travel time equity (BALANCE_WEIGHT: 0.3)
   - Lower score = better station

6. **Display** (`app.js:120-141`, `mapView.js:86-113`): Render top 5 results with map visualization

### Module Responsibilities

- **config.js**: All configuration constants, debug logger, config validation
- **gaodeApi.js**: AMap API wrapper with plugin-based services (avoids CORS issues)
- **stationFinder.js**: Core algorithm implementation (candidate extraction, scoring, ranking)
- **mapView.js**: Map visualization, marker management, route drawing
- **app.js**: Application orchestration, UI handling, search history

### Key Design Patterns

1. **Plugin-based API calls**: Uses AMap JavaScript API plugins (Geocoder, Transfer, PlaceSearch) instead of REST API to avoid CORS
2. **Dual-strategy geocoding**: Geocoder + PlaceSearch fallback with 10s timeouts
3. **Rate limiting protection**: Batch processing with delays (see stationFinder.js:157-207)
4. **Global singleton pattern**: Each module creates a global instance for cross-module access

### API Rate Limiting Strategy

The code implements careful rate limiting to avoid hitting AMap's QPS limits:

- Batch size: 2 concurrent requests (`stationFinder.js:158`)
- Inter-batch delay: 800ms (`stationFinder.js:206`)
- Per-request delay: 300ms (`stationFinder.js:174`)
- Random jitter: 100-200ms (`stationFinder.js:165`)
- API timeouts: 10s for geocoding, 15s for routes (`gaodeApi.js:107,201`)

If you modify the algorithm to make more API calls, you MUST adjust these delays proportionally.

### Scoring Algorithm Details

The ranking algorithm balances two competing objectives:

- **Primary**: Minimize `max(timeA, timeB)` - the longest wait for either person
- **Secondary**: Minimize `abs(timeA - timeB)` - the time difference (fairness)

The `BALANCE_WEIGHT` parameter (default 0.3) controls the trade-off:
- 0.0 = Only consider longest wait time
- 0.5 = Equal weight to both factors
- 1.0 = Only consider fairness

## Common Modifications

### Adjusting Search Parameters

Edit `js/config.js` ALGORITHM section:

```javascript
ALGORITHM: {
    BALANCE_WEIGHT: 0.3,      // 0.0-1.0: fairness vs efficiency trade-off
    MAX_RESULTS: 5,           // Number of recommendations to show
    SEARCH_RADIUS: 3000,      // Radius around midpoint (meters)
    MAX_CANDIDATES: 10        // Limit candidates to avoid QPS issues
}
```

**Warning**: Increasing MAX_CANDIDATES requires adjusting rate limiting delays in `stationFinder.js:158-206`.

### Extending to Other Cities

1. Update `CONFIG.CITY` and `CONFIG.CITY_CODE` in `js/config.js`
2. Update `CONFIG.MAP_CONFIG.center` to the city center coordinates
3. Modify `gaodeApi.js:304-308` if the city uses different subway naming conventions

### Adding New Station Sources

To add a new candidate extraction strategy:

1. Add collection logic in `stationFinder.js:extractCandidateStations`
2. Add to `candidateSet` Map with appropriate `source` tag
3. Ensure deduplication by station name

## Important Implementation Notes

- The app uses localStorage for search history (max 10 entries)
- All coordinates use AMap's GCJ-02 coordinate system
- File load order matters: config → gaodeApi → stationFinder → mapView → app (see `index.html:98-102`)
- Map initialization is delayed 500ms to ensure AMap is fully loaded (`mapView.js:345`)
- App initialization is delayed 100ms to ensure dependencies are ready (`app.js:356`)
- Error messages have 5s auto-dismiss timeout (`app.js:226-228`)

## Debugging

Set `CONFIG.DEBUG = true` in `js/config.js` to enable console logging with `[SubwayFinder]` prefix. Logs include:

- Service initialization status
- API request/response details
- Route extraction progress
- Candidate processing status
- Timing information for rate limiting

Check browser console (F12) for detailed error messages, especially for API configuration issues.
- Alaways use Chinese to comment in code base