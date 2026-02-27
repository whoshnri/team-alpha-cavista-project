// clinics.ts — Nearby clinics finder powered by OpenStreetMap Overpass API
// No API key required. Output structure identical to the Google Places version.

import { Hono } from "hono";
import { jwt } from "hono/jwt";
import { prisma } from "../prisma/client.js";

const clinics = new Hono();
const JWT_SECRET = process.env.JWT_SECRET || "nimi_super_secret_key_123!";

clinics.use("/*", jwt({ secret: JWT_SECRET, alg: "HS256" }));

// ─────────────────────────────────────────────
// MATH HELPERS (Haversine + Bearing)
// ─────────────────────────────────────────────

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
}

function compassBearing(lat1: number, lng1: number, lat2: number, lng2: number) {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const toDeg = (rad: number) => (rad * 180) / Math.PI;
    const dLng = toRad(lng2 - lng1);
    const y = Math.sin(dLng) * Math.cos(toRad(lat2));
    const x =
        Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
        Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
    const bearing = (toDeg(Math.atan2(y, x)) + 360) % 360;
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(bearing / 45) % 8;
    return { degrees: Math.round(bearing), cardinal: directions[index] };
}

function formatDistance(meters: number): string {
    if (meters < 1000) return `${meters}m`;
    return `${(meters / 1000).toFixed(1)}km`;
}

// ─────────────────────────────────────────────
// OVERPASS API QUERY
// ─────────────────────────────────────────────

async function queryOverpass(lat: number, lng: number, radiusMeters: number): Promise<any[]> {
    const query = `
    [out:json][timeout:15];
    (
      node["amenity"="hospital"](around:${radiusMeters},${lat},${lng});
      node["amenity"="clinic"](around:${radiusMeters},${lat},${lng});
      node["amenity"="pharmacy"](around:${radiusMeters},${lat},${lng});
      node["amenity"="doctors"](around:${radiusMeters},${lat},${lng});
      node["amenity"="health_post"](around:${radiusMeters},${lat},${lng});
      way["amenity"="hospital"](around:${radiusMeters},${lat},${lng});
      way["amenity"="clinic"](around:${radiusMeters},${lat},${lng});
    );
    out body center;
  `;

    const endpoints = [
        'https://overpass-api.de/api/interpreter',
        'https://lz4.overpass-api.de/api/interpreter',
        'https://z.overpass-api.de/api/interpreter',
    ];

    for (const endpoint of endpoints) {
        try {
            console.log(`[Clinics] Trying Overpass endpoint: ${endpoint}`);
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 12000);

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `data=${encodeURIComponent(query)}`,
                signal: controller.signal,
            });
            clearTimeout(timeout);

            console.log(`[Clinics] Overpass response status: ${response.status}`);
            if (!response.ok) {
                const errorBody = await response.text();
                console.warn(`[Clinics] ${endpoint} returned ${response.status}, trying next...`);
                continue;
            }
            const data = await response.json();
            console.log(`[Clinics] Overpass returned ${data.elements?.length ?? 0} raw elements`);
            return data.elements || [];
        } catch (err: any) {
            console.warn(`[Clinics] ${endpoint} failed: ${err.message}, trying next...`);
            continue;
        }
    }

    throw new Error('All Overpass API endpoints failed or timed out');
}

// ─────────────────────────────────────────────
// OSM OPENING HOURS PARSER
// ─────────────────────────────────────────────

function parseOSMOpeningHours(osmHoursString: string | undefined) {
    if (!osmHoursString) {
        return {
            available: false, open_now: null, periods: [] as any[], weekday_text: [] as string[],
            next_open: null, hours_today: null, raw: null
        };
    }

    const now = new Date();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayAbbr: Record<string, number> = { 'Mo': 1, 'Tu': 2, 'We': 3, 'Th': 4, 'Fr': 5, 'Sa': 6, 'Su': 0 };
    const todayIndex = now.getDay();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // Handle 24/7
    if (osmHoursString.trim() === '24/7') {
        return {
            available: true, open_now: true,
            periods: [{ day: 'Every day', day_index: -1, opens: '00:00', closes: '24:00', open_24h: true }],
            weekday_text: ['Open 24 hours, 7 days a week'],
            next_open: null, hours_today: 'Open 24 hours', raw: osmHoursString
        };
    }

    const periods: any[] = [];
    const weekday_text: string[] = [];
    let open_now = false;
    let hours_today: string | null = null;

    const rules = osmHoursString.split(';').map(r => r.trim());

    rules.forEach(rule => {
        const match = rule.match(/([A-Za-z,\-]+)\s+(\d{2}:\d{2})-(\d{2}:\d{2})/);
        if (!match) return;

        const [, daysPart, opens, closes] = match;
        const openMin = parseInt(opens.split(':')[0]) * 60 + parseInt(opens.split(':')[1]);
        const closeMin = parseInt(closes.split(':')[0]) * 60 + parseInt(closes.split(':')[1]);

        const expandedDays: number[] = [];
        if (daysPart.includes('-')) {
            const [start, end] = daysPart.split('-');
            const startIdx = dayAbbr[start];
            const endIdx = dayAbbr[end];
            if (startIdx !== undefined && endIdx !== undefined) {
                for (let d = startIdx; d <= endIdx; d++) expandedDays.push(d);
            }
        } else {
            daysPart.split(',').forEach(abbr => {
                const idx = dayAbbr[abbr.trim()];
                if (idx !== undefined) expandedDays.push(idx);
            });
        }

        expandedDays.forEach(dayIdx => {
            periods.push({ day: dayNames[dayIdx], day_index: dayIdx, opens, closes, open_24h: false });
            weekday_text.push(`${dayNames[dayIdx]}: ${opens} – ${closes}`);
            if (dayIdx === todayIndex) {
                hours_today = `${opens} – ${closes}`;
                if (currentMinutes >= openMin && currentMinutes < closeMin) open_now = true;
            }
        });
    });

    let next_open: string | null = null;
    if (!open_now) {
        for (let i = 1; i <= 7; i++) {
            const checkDay = (todayIndex + i) % 7;
            const next = periods.find((p: any) => p.day_index === checkDay);
            if (next) { next_open = `${next.day} at ${next.opens}`; break; }
        }
    }

    return {
        available: true, open_now, periods, weekday_text, next_open,
        hours_today: hours_today || 'Hours unavailable for today', raw: osmHoursString
    };
}

// ─────────────────────────────────────────────
// OSM RESULT FORMATTER
// ─────────────────────────────────────────────

function formatOSMClinic(element: any, userLat: number, userLng: number) {
    const tags = element.tags || {};
    const lat = element.lat ?? element.center?.lat;
    const lng = element.lon ?? element.center?.lon;

    const distance = (lat && lng) ? haversineDistance(userLat, userLng, lat, lng) : null;
    const bearing = (lat && lng) ? compassBearing(userLat, userLng, lat, lng) : null;
    const openingHours = parseOSMOpeningHours(tags['opening_hours']);

    const addressParts = [
        tags['addr:housenumber'], tags['addr:street'],
        tags['addr:suburb'], tags['addr:city'] || tags['addr:state']
    ].filter(Boolean);
    const address = addressParts.length > 0 ? addressParts.join(', ') : tags['name'] || 'Address unavailable';

    const directionsUrl = (lat && lng)
        ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
        : null;

    return {
        place_id: `osm_${element.type}_${element.id}`,
        name: tags['name'] || tags['operator'] || 'Unnamed Clinic',
        address,
        phone: tags['phone'] || tags['contact:phone'] || null,
        website: tags['website'] || tags['contact:website'] || null,
        coordinates: lat && lng ? { lat, lng } : null,
        distance: { meters: distance, formatted: distance ? formatDistance(distance) : null },
        bearing,
        rating: { score: null, total_reviews: 0, display: 'No ratings — OSM data' },
        status: 'OPERATIONAL',
        types: [tags['amenity'] || 'health'],
        opening_hours: openingHours,
        accessibility: {
            wheelchair: tags['wheelchair'] === 'yes' ? true : tags['wheelchair'] === 'no' ? false : null
        },
        navigation: {
            directions_url: directionsUrl,
            plus_code: null
        },
        source: 'openstreetmap'
    };
}

// ─────────────────────────────────────────────
// MASTER FUNCTION (no API key required)
// ─────────────────────────────────────────────

export async function findNearbyClinics(
    userLat: number, userLng: number,
    options: { radius?: number; maxResults?: number; openNow?: boolean } = {}
) {
    const { radius = 5000, maxResults = 10, openNow = false } = options;

    try {
        console.log(`[Clinics] findNearbyClinics called: lat=${userLat}, lng=${userLng}, radius=${radius}, maxResults=${maxResults}, openNow=${openNow}`);
        const elements = await queryOverpass(userLat, userLng, radius);

        if (elements.length === 0) {
            console.log(`[Clinics] No elements returned from Overpass`);
            return {
                success: true, user_location: { lat: userLat, lng: userLng }, total_found: 0, clinics: [],
                meta: { radius_searched_m: radius, timestamp: new Date().toISOString(), source: 'openstreetmap', message: 'No clinics found within search radius' }
            };
        }

        const withName = elements.filter((el: any) => el.tags?.name);
        console.log(`[Clinics] Elements with name: ${withName.length} / ${elements.length}`);

        let formattedClinics = withName
            .map((el: any) => formatOSMClinic(el, userLat, userLng))
            .filter((c: any) => c.coordinates !== null)
            .sort((a: any, b: any) => (a.distance.meters || 999999) - (b.distance.meters || 999999))
            .slice(0, maxResults);

        console.log(`[Clinics] Formatted clinics: ${formattedClinics.length}`);

        if (openNow) {
            formattedClinics = formattedClinics.filter((c: any) => c.opening_hours.open_now === true);
        }

        console.log(`[Clinics] ✅ Returning ${formattedClinics.length} clinics`);
        return {
            success: true, user_location: { lat: userLat, lng: userLng }, total_found: formattedClinics.length, clinics: formattedClinics,
            meta: { radius_searched_m: radius, timestamp: new Date().toISOString(), source: 'openstreetmap', open_now_filter: openNow, raw_osm_elements: elements.length }
        };
    } catch (error: any) {
        console.error(`[Clinics] ❌ Error in findNearbyClinics:`, error.message, error.stack?.slice(0, 300));
        return {
            success: false, user_location: { lat: userLat, lng: userLng }, total_found: 0, clinics: [],
            error: { message: error.message, code: 'SEARCH_FAILED' },
            meta: { timestamp: new Date().toISOString(), source: 'openstreetmap' }
        };
    }
}

// ─────────────────────────────────────────────
// HONO ROUTE
// ─────────────────────────────────────────────

clinics.get("/nearby", async (c) => {
    const lat = c.req.query("lat");
    const lng = c.req.query("lng");
    const radius = c.req.query("radius");
    const openNow = c.req.query("open_now");
    const chatSessionId = c.req.header("x-chat-session-id");

    console.log(`[Clinics Route] GET /nearby — lat=${lat}, lng=${lng}, radius=${radius}, open_now=${openNow}, session=${chatSessionId ?? 'none'}`);

    if (!lat || !lng) {
        return c.json({ success: false, error: { message: "lat and lng are required", code: "MISSING_PARAMS" } }, 400);
    }

    const result = await findNearbyClinics(
        parseFloat(lat), parseFloat(lng),
        { radius: radius ? parseInt(radius) : 5000, openNow: openNow === "true" }
    );

    // Persist clinic search result into the chat session JSON (fire-and-forget)
    if (chatSessionId && result.success) {
        (async () => {
            try {
                const session = await prisma.chatSession.findUnique({
                    where: { id: chatSessionId },
                });
                if (!session) return;

                const currentMessages = Array.isArray(session.messages) ? (session.messages as any[]) : [];
                const updatedMessages = [...currentMessages, {
                    role: 'tool_result',
                    tool: 'nearby_clinics',
                    data: {
                        clinics: result.clinics,
                        total_found: result.total_found,
                        radius: result.meta?.radius_searched_m ?? 5000,
                    },
                    timestamp: new Date().toISOString(),
                }];

                await prisma.chatSession.update({
                    where: { id: chatSessionId },
                    data: { messages: updatedMessages }
                });

                console.log(`[Clinics Route] Persisted ${result.total_found} clinic results in session: ${chatSessionId}`);
            } catch (err) {
                console.error("[Clinics Route] Failed to persist clinic results:", err);
            }
        })();
    }

    const status = result.success ? 200 : 500;
    console.log(`[Clinics Route] Responding with ${status} — ${result.total_found} clinics`);
    return c.json(result, status);
});

export { clinics as clinicsRoutes };
