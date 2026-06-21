"use client";

import { useEffect, useRef } from "react";
import type * as Leaflet from "leaflet";

export type MapTicket = {
  id: string;
  title: string;
  issue_type?: string;
  severity: "low" | "medium" | "high" | "critical";
  latitude: number | null;
  longitude: number | null;
  ticket_no?: string;
};

type HeatmapProps = {
  tickets: MapTicket[];
  center?: [number, number];
};

type PickerProps = {
  latitude?: number | null;
  longitude?: number | null;
  onPick: (coords: { latitude: number; longitude: number }) => void;
};

export type RouteSegment = {
  from: [number, number];
  to: [number, number];
  risk: "safe" | "moderate" | "high";
  path?: [number, number][];
};

type SafeRouteMapProps = {
  segments: RouteSegment[];
  tickets: MapTicket[];
  center?: [number, number];
};

const DEFAULT_CENTER: [number, number] = [17.385, 78.4867];
let leafletPromise: Promise<typeof Leaflet> | null = null;

function loadLeaflet() {
  leafletPromise ??= import("leaflet");
  return leafletPromise;
}

function issueImpact(issueType: string | undefined) {
  const normalized = String(issueType ?? "").toLowerCase();
  if (normalized.includes("waterlogging")) return { radius: 900, opacity: 0.45 };
  if (normalized.includes("fallen_tree") || normalized.includes("drainage")) return { radius: 700, opacity: 0.4 };
  if (normalized.includes("garbage")) return { radius: 520, opacity: 0.36 };
  return { radius: 320, opacity: 0.32 };
}

function resetLeafletContainer(container: HTMLDivElement) {
  const leafletContainer = container as HTMLDivElement & { _leaflet_id?: number | null; _leaflet_pos?: unknown };
  if (leafletContainer._leaflet_id) leafletContainer._leaflet_id = null;
  if (leafletContainer._leaflet_pos) leafletContainer._leaflet_pos = undefined;
}

export function TicketHeatMap({ tickets, center = DEFAULT_CENTER }: HeatmapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const layerRef = useRef<Leaflet.LayerGroup | null>(null);
  const [centerLat, centerLng] = center;

  useEffect(() => {
    let cancelled = false;
    void loadLeaflet().then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      resetLeafletContainer(containerRef.current);
      const map = L.map(containerRef.current, { scrollWheelZoom: true }).setView([centerLat, centerLng], 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [centerLat, centerLng]);

  useEffect(() => {
    let cancelled = false;
    void loadLeaflet().then((L) => {
      const map = mapRef.current;
      if (cancelled || !map) return;
      layerRef.current?.remove();
      const layer = L.layerGroup().addTo(map);
      const validTickets = tickets.filter((ticket) => ticket.latitude !== null && ticket.longitude !== null);

      validTickets.forEach((ticket) => {
        const color = ticket.severity === "critical" ? "#7c5cff" : ticket.severity === "high" ? "#ffb72b" : ticket.severity === "medium" ? "#2f7df6" : "#19c99a";
        const impact = issueImpact(ticket.issue_type);
        L.circle([Number(ticket.latitude), Number(ticket.longitude)], {
          radius: impact.radius,
          color,
          fillColor: color,
          fillOpacity: impact.opacity,
          weight: 2,
        })
          .bindPopup(`<strong>${ticket.ticket_no ?? "Ticket"}</strong><br/>${ticket.title}<br/>Type: ${ticket.issue_type ?? "issue"}<br/>Severity: ${ticket.severity}`)
          .addTo(layer);
      });

      if (validTickets.length > 0) {
        const bounds = L.latLngBounds(validTickets.map((ticket) => [Number(ticket.latitude), Number(ticket.longitude)] as [number, number]));
        map.fitBounds(bounds.pad(0.25), { maxZoom: 14 });
      } else {
        map.setView([centerLat, centerLng], 12);
      }
      layerRef.current = layer;
    });
    return () => {
      cancelled = true;
      layerRef.current?.remove();
      layerRef.current = null;
    };
  }, [centerLat, centerLng, tickets]);

  return <div ref={containerRef} className="leaflet-map" />;
}

export function SafeRouteMap({ segments, tickets, center = DEFAULT_CENTER }: SafeRouteMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const layerRef = useRef<Leaflet.LayerGroup | null>(null);
  const [centerLat, centerLng] = center;

  useEffect(() => {
    let cancelled = false;
    void loadLeaflet().then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      resetLeafletContainer(containerRef.current);
      const map = L.map(containerRef.current, { scrollWheelZoom: true }).setView([centerLat, centerLng], 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [centerLat, centerLng]);

  useEffect(() => {
    let cancelled = false;
    void loadLeaflet().then((L) => {
      const map = mapRef.current;
      if (cancelled || !map) return;
      layerRef.current?.remove();
      const layer = L.layerGroup().addTo(map);
      const colors = { safe: "#19c99a", moderate: "#ffb72b", high: "#7c5cff" };
      segments.forEach((segment) => {
        L.polyline(segment.path && segment.path.length > 1 ? segment.path : [segment.from, segment.to], { color: colors[segment.risk], weight: 7, opacity: 0.9 }).addTo(layer);
      });
      tickets.filter((ticket) => ticket.latitude !== null && ticket.longitude !== null).forEach((ticket) => {
        const impact = issueImpact(ticket.issue_type);
        const color = ticket.severity === "critical" ? "#7c5cff" : ticket.severity === "high" ? "#ffb72b" : "#2f7df6";
        L.circle([Number(ticket.latitude), Number(ticket.longitude)], {
          radius: impact.radius,
          color,
          fillColor: color,
          fillOpacity: 0.18,
          weight: 1,
        }).addTo(layer);
      });
      const boundsPoints = segments.flatMap((segment) => segment.path && segment.path.length > 1 ? segment.path : [segment.from, segment.to]);
      if (boundsPoints.length > 0) {
        map.fitBounds(L.latLngBounds(boundsPoints).pad(0.25), { maxZoom: 14 });
      }
      layerRef.current = layer;
    });
    return () => {
      cancelled = true;
      layerRef.current?.remove();
      layerRef.current = null;
    };
  }, [segments, tickets]);

  return <div ref={containerRef} className="leaflet-map" />;
}

export function LocationPickerMap({ latitude, longitude, onPick }: PickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const markerRef = useRef<Leaflet.Marker | null>(null);
  const onPickRef = useRef(onPick);
  const initialLatitudeRef = useRef(latitude);
  const initialLongitudeRef = useRef(longitude);

  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    let cancelled = false;
    void loadLeaflet().then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      resetLeafletContainer(containerRef.current);
      const startCenter: [number, number] = initialLatitudeRef.current && initialLongitudeRef.current ? [initialLatitudeRef.current, initialLongitudeRef.current] : DEFAULT_CENTER;
      const map = L.map(containerRef.current, { scrollWheelZoom: true }).setView(startCenter, 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);
      map.on("click", (event: Leaflet.LeafletMouseEvent) => {
        const picked = { latitude: Number(event.latlng.lat.toFixed(7)), longitude: Number(event.latlng.lng.toFixed(7)) };
        markerRef.current?.remove();
        markerRef.current = L.marker([picked.latitude, picked.longitude]).addTo(map);
        onPickRef.current(picked);
      });
      mapRef.current = map;
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadLeaflet().then((L) => {
      const map = mapRef.current;
      if (cancelled || !map || !latitude || !longitude) return;
      markerRef.current?.remove();
      markerRef.current = L.marker([latitude, longitude]).addTo(map);
      map.setView([latitude, longitude], 14);
    });
    return () => { cancelled = true; };
  }, [latitude, longitude]);

  return <div ref={containerRef} className="leaflet-map picker" />;
}
