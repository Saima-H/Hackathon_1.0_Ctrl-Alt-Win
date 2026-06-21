export const hyderabadLocalities = [
  "Abids",
  "Ameerpet",
  "Attapur",
  "Bachupally",
  "Balanagar",
  "Banjara Hills",
  "Begumpet",
  "BHEL Township",
  "Boduppal",
  "Borabanda",
  "Bowenpally",
  "Chanda Nagar",
  "Charminar",
  "Dilsukhnagar",
  "Gachibowli",
  "Gandipet",
  "Habsiguda",
  "Hafeezpet",
  "Himayat Nagar",
  "HITEC City",
  "Jubilee Hills",
  "Kachiguda",
  "Kavadiguda",
  "Khairatabad",
  "Kondapur",
  "Koti",
  "Kukatpally",
  "LB Nagar",
  "Madhapur",
  "Madinaguda",
  "Malakpet",
  "Malkajgiri",
  "Manikonda",
  "Masab Tank",
  "Mehdipatnam",
  "Miyapur",
  "Moosapet",
  "Musheerabad",
  "Nallakunta",
  "Nampally",
  "Nanakramguda",
  "Narayanaguda",
  "Narsingi",
  "Patancheru",
  "Punjagutta",
  "Rajendra Nagar",
  "Ramanthapur",
  "Sanath Nagar",
  "Secunderabad",
  "Serilingampally",
  "Somajiguda",
  "Tarnaka",
  "Tolichowki",
  "Uppal",
  "Vanasthalipuram",
  "Yousufguda",
];

export const ghmcDepartments = [
  "Roads & Maintenance",
  "Drainage Department",
  "Urban Forestry",
  "Electrical Department",
];

export const ghmcOffices = [
  { name: "GHMC Head Office", zone: "Central Zone", locality: "Himayat Nagar", latitude: 17.4065, longitude: 78.4772 },
  { name: "GHMC Khairatabad Zonal Office", zone: "Central Zone", locality: "Khairatabad", latitude: 17.4126, longitude: 78.4627 },
  { name: "GHMC Charminar Zonal Office", zone: "South Zone", locality: "Charminar", latitude: 17.3616, longitude: 78.4747 },
  { name: "GHMC Secunderabad Zonal Office", zone: "North Zone", locality: "Secunderabad", latitude: 17.4399, longitude: 78.4983 },
  { name: "GHMC Kukatpally Zonal Office", zone: "West Zone", locality: "Kukatpally", latitude: 17.4948, longitude: 78.3996 },
  { name: "GHMC Serilingampally Zonal Office", zone: "West Zone", locality: "Serilingampally", latitude: 17.4837, longitude: 78.3158 },
  { name: "GHMC LB Nagar Zonal Office", zone: "East Zone", locality: "LB Nagar", latitude: 17.3457, longitude: 78.5522 },
  { name: "GHMC Uppal Circle Office", zone: "East Zone", locality: "Uppal", latitude: 17.4056, longitude: 78.5591 },
];

export function distanceKm(aLat: number | null, aLng: number | null, bLat: number | null, bLng: number | null) {
  if (aLat === null || aLng === null || bLat === null || bLng === null) return null;
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const startLat = toRad(aLat);
  const endLat = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(startLat) * Math.cos(endLat) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function nearestGhmcOffice(latitude: number | null, longitude: number | null) {
  if (latitude === null || longitude === null) return null;
  return ghmcOffices
    .map((office) => ({ ...office, distanceKm: distanceKm(latitude, longitude, office.latitude, office.longitude) ?? Number.POSITIVE_INFINITY }))
    .sort((a, b) => a.distanceKm - b.distanceKm)[0] ?? null;
}

export function isPlaceholderText(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  return !normalized || normalized === "your address or landmark" || normalized === "address / landmark" || normalized === "your locality";
}
