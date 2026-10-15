"""
Geocoding and Delivery Area Validation Module for Sanjay Kirana Store
Calculates authoritative straight-line distance using the Haversine formula
and validates delivery eligibility against a strict 2,000-metre radius.
"""

import math
import logging
import urllib.request
import urllib.parse
import json

logger = logging.getLogger(__name__)

# Fixed Store Coordinates (Harraiya, Basti, UP - PIN 272155)
STORE_NAME = "Sanjay Kirana Store"
STORE_OWNER = "Sanjay"
STORE_PHONE = "9919193538"
STORE_LATITUDE = 26.794389
STORE_LONGITUDE = 82.462083
STORE_PINCODE = "272155"
STORE_LOCATION = "Harraiya, Basti, Uttar Pradesh, India"

# Delivery Constraints
MAX_DELIVERY_RADIUS_METERS = 2000.0  # Strict 2 km limit
EARTH_RADIUS_METERS = 6371000.0       # Earth mean radius in meters

# Curated Landmarks in and around Harraiya (Basti district) for zero-cost location selection
HARRAIYA_LANDMARKS = [
    {
        "id": "harraiya_chowk",
        "name": "Harraiya Main Chowk / Bus Stand",
        "description": "Main Market & Bus Stand, Harraiya (~0.1 km)",
        "latitude": 26.794500,
        "longitude": 82.463000,
    },
    {
        "id": "purani_bazar",
        "name": "Purani Bazar, Harraiya",
        "description": "Old Bazaar Ward, Harraiya (~0.1 km)",
        "latitude": 26.793800,
        "longitude": 82.461200,
    },
    {
        "id": "tehsil_office",
        "name": "Tehsil Complex / SDM Office",
        "description": "Tehsil Road, Harraiya (~0.3 km)",
        "latitude": 26.797200,
        "longitude": 82.461100,
    },
    {
        "id": "thana_road",
        "name": "Harraiya Police Station (Thana)",
        "description": "Thana Road, Harraiya (~0.3 km)",
        "latitude": 26.796000,
        "longitude": 82.464500,
    },
    {
        "id": "chc_hospital",
        "name": "Community Health Centre (CHC Hospital)",
        "description": "Hospital Road, Harraiya (~0.6 km)",
        "latitude": 26.798500,
        "longitude": 82.458000,
    },
    {
        "id": "block_office",
        "name": "Block Development Office (Vikas Khand)",
        "description": "Block Road, Harraiya (~0.7 km)",
        "latitude": 26.792000,
        "longitude": 82.456000,
    },
    {
        "id": "nh27_bypass",
        "name": "NH-27 Flyover / Bypass Crossing",
        "description": "National Highway 27 Junction, Harraiya (~0.5 km)",
        "latitude": 26.789500,
        "longitude": 82.462500,
    },
    {
        "id": "babhnan_road",
        "name": "Babhnan Road Crossing",
        "description": "Babhnan Road, Harraiya (~0.9 km)",
        "latitude": 26.802000,
        "longitude": 82.460000,
    },
    {
        "id": "belbhariya",
        "name": "Belbhariya / Khasaha Village",
        "description": "Harraiya Rural Area (~1.4 km - Eligible)",
        "latitude": 26.805000,
        "longitude": 82.470000,
    },
    {
        "id": "chhatauna_out",
        "name": "Chhatauna Village (Outside 2 km)",
        "description": "Harraiya Rural Area (~2.6 km - Outside delivery area)",
        "latitude": 26.812000,
        "longitude": 82.445000,
    },
    {
        "id": "roopgarh_out",
        "name": "Roopgarh Village (Outside 2 km)",
        "description": "Harraiya Sector (~3.5 km - Outside delivery area)",
        "latitude": 26.772000,
        "longitude": 82.448000,
    },
    {
        "id": "bardiha_out",
        "name": "Bardiha Village (Outside 2 km)",
        "description": "Near Harraiya (~4.2 km - Outside delivery area)",
        "latitude": 26.828000,
        "longitude": 82.472000,
    },
    {
        "id": "kaptanganj_out",
        "name": "Kaptanganj Bazar (Outside 2 km)",
        "description": "Basti District (~11 km - Outside delivery area)",
        "latitude": 26.760000,
        "longitude": 82.350000,
    },
    {
        "id": "basti_city_out",
        "name": "Basti City / Company Bagh (Outside 2 km)",
        "description": "Basti District HQ (~30 km - Outside delivery area)",
        "latitude": 26.801000,
        "longitude": 82.763000,
    }
]


def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Computes straight-line great-circle distance in metres between two points
    on Earth using the Haversine formula:
    d = 2 * R * arcsin(sqrt(sin^2(dlat/2) + cos(lat1) * cos(lat2) * sin^2(dlon/2)))
    """
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2))
    
    # Ensure numerical stability within [0, 1]
    a = min(1.0, max(0.0, a))
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return EARTH_RADIUS_METERS * c


def calculate_store_distance(lat: float, lon: float) -> float:
    """Calculates straight-line distance in metres from Sanjay Kirana Store."""
    return haversine_distance_meters(STORE_LATITUDE, STORE_LONGITUDE, lat, lon)


def validate_coordinates(lat, lon):
    """
    Authoritative backend validation for delivery coordinates.
    Returns: (is_valid, is_eligible, distance_meters, error_message)
    """
    try:
        lat_f = float(lat)
        lon_f = float(lon)
    except (ValueError, TypeError):
        return False, False, None, "Invalid coordinates. Latitude and longitude must be valid decimal numbers."

    if not (-90.0 <= lat_f <= 90.0 and -180.0 <= lon_f <= 180.0):
        return False, False, None, "Coordinates are out of global valid range (-90 to 90, -180 to 180)."

    dist_meters = calculate_store_distance(lat_f, lon_f)
    is_eligible = dist_meters <= MAX_DELIVERY_RADIUS_METERS

    return True, is_eligible, round(dist_meters, 2), None


def get_curated_landmarks():
    """Returns curated landmarks annotated with calculated distance and eligibility."""
    annotated = []
    for lm in HARRAIYA_LANDMARKS:
        dist = calculate_store_distance(lm["latitude"], lm["longitude"])
        annotated.append({
            "id": lm["id"],
            "name": lm["name"],
            "description": lm["description"],
            "latitude": lm["latitude"],
            "longitude": lm["longitude"],
            "distance_meters": round(dist, 2),
            "distance_km": round(dist / 1000.0, 2),
            "is_eligible": dist <= MAX_DELIVERY_RADIUS_METERS,
        })
    return annotated


def geocode_address_nominatim(address_text: str, pincode: str = None):
    """
    Free OpenStreetMap Nominatim geocoding fallback for custom addresses.
    Biased towards Harraiya, Basti, Uttar Pradesh (PIN 272155).
    Times out safely after 3 seconds.
    """
    if not address_text or not address_text.strip():
        return None, "Address query cannot be empty."

    query_parts = [address_text.strip()]
    if pincode and str(pincode).strip():
        query_parts.append(str(pincode).strip())
    query_parts.extend(["Harraiya", "Basti", "Uttar Pradesh", "India"])
    query_string = ", ".join(query_parts)

    url = f"https://nominatim.openstreetmap.org/search?{urllib.parse.urlencode({'q': query_string, 'format': 'json', 'limit': '1'})}"

    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "SanjayKiranaStore-DeliveryChecker/1.0 (contact: 9919193538)"
        }
    )

    try:
        with urllib.request.urlopen(req, timeout=3.5) as response:
            if response.status == 200:
                data = json.loads(response.read().decode("utf-8"))
                if data and len(data) > 0:
                    first_res = data[0]
                    lat = float(first_res["lat"])
                    lon = float(first_res["lon"])
                    display_name = first_res.get("display_name", address_text)
                    dist = calculate_store_distance(lat, lon)
                    return {
                        "latitude": lat,
                        "longitude": lon,
                        "display_name": display_name,
                        "distance_meters": round(dist, 2),
                        "distance_km": round(dist / 1000.0, 2),
                        "is_eligible": dist <= MAX_DELIVERY_RADIUS_METERS,
                    }, None
                else:
                    return None, "No coordinates found for the provided address on OpenStreetMap."
            else:
                return None, f"Geocoding service returned HTTP status {response.status}."
    except Exception as e:
        logger.warning(f"Nominatim geocoding lookup failed: {e}")
        return None, f"Online address search unavailable: {str(e)}"

