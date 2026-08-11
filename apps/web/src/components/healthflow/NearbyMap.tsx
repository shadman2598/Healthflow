"use client";

import { useEffect, useId, useRef } from "react";
import type { ResourceResult } from "../../types/healthflow";

type NearbyMapProps = {
  origin: { lat: number; lon: number; label: string };
  results: ResourceResult[];
};

type LeafletNS = {
  map: (el: HTMLElement, opts?: Record<string, unknown>) => LeafletMap;
  tileLayer: (url: string, opts?: Record<string, unknown>) => { addTo: (map: LeafletMap) => void };
  layerGroup: () => LeafletLayerGroup;
  circleMarker: (
    latlng: [number, number],
    opts?: Record<string, unknown>
  ) => LeafletMarker;
};

type LeafletMap = {
  addLayer: (layer: unknown) => void;
  setView: (latlng: [number, number], zoom: number) => void;
  fitBounds: (bounds: [number, number][], opts?: Record<string, unknown>) => void;
  invalidateSize: () => void;
  remove: () => void;
};

type LeafletLayerGroup = {
  addTo: (map: LeafletMap) => LeafletLayerGroup;
  clearLayers: () => void;
};

type LeafletMarker = {
  addTo: (layer: LeafletLayerGroup) => LeafletMarker;
  bindPopup: (html: string) => void;
};

declare global {
  interface Window {
    L?: LeafletNS;
  }
}

let leafletLoader: Promise<LeafletNS> | null = null;

function loadLeaflet(): Promise<LeafletNS> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Leaflet requires a browser"));
  }
  if (window.L) return Promise.resolve(window.L);
  if (leafletLoader) return leafletLoader;

  leafletLoader = new Promise((resolve, reject) => {
    const cssId = "hf-leaflet-css";
    if (!document.getElementById(cssId)) {
      const link = document.createElement("link");
      link.id = cssId;
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    const existing = document.getElementById("hf-leaflet-js") as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");
    script.id = "hf-leaflet-js";
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.onload = () => {
      if (window.L) resolve(window.L);
      else reject(new Error("Leaflet failed to load"));
    };
    script.onerror = () => reject(new Error("Leaflet failed to load"));
    if (!existing) document.body.appendChild(script);
    else if (window.L) resolve(window.L);
  });

  return leafletLoader;
}

export function NearbyMap({ origin, results }: NearbyMapProps) {
  const mapId = useId().replace(/:/g, "");
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ map: LeafletMap; layer: LeafletLayerGroup } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const setup = async (): Promise<void> => {
      try {
        const L = await loadLeaflet();
        if (cancelled || !containerRef.current) return;

        if (!mapRef.current) {
          const map = L.map(containerRef.current, { scrollWheelZoom: false });
          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          }).addTo(map);
          const layer = L.layerGroup().addTo(map);
          mapRef.current = { map, layer };
        }

        const { map, layer } = mapRef.current;
        layer.clearLayers();

        const bounds: [number, number][] = [[origin.lat, origin.lon]];

        const you = L.circleMarker([origin.lat, origin.lon], {
          radius: 9,
          color: "#0f766e",
          fillColor: "#14b8a6",
          fillOpacity: 0.95,
          weight: 2
        }).addTo(layer);
        you.bindPopup(`<strong>Your postal code</strong><br/>${origin.label}`);

        results.forEach((result, index) => {
          if (result.lat == null || result.lon == null) return;
          bounds.push([result.lat, result.lon]);
          const marker = L.circleMarker([result.lat, result.lon], {
            radius: 8,
            color: "#1e293b",
            fillColor: "#f8fafc",
            fillOpacity: 1,
            weight: 2
          }).addTo(layer);
          marker.bindPopup(
            `<strong>#${index + 1} ${result.name}</strong><br/>${result.address}<br/><em>${result.distance}</em>`
          );
        });

        if (bounds.length === 1) {
          map.setView(bounds[0], 13);
        } else {
          map.fitBounds(bounds, { padding: [36, 36], maxZoom: 14 });
        }

        setTimeout(() => map.invalidateSize(), 50);
      } catch {
        // List + directions still work if the map CDN is blocked.
      }
    };

    void setup();
    return () => {
      cancelled = true;
    };
  }, [origin, results, mapId]);

  useEffect(() => {
    return () => {
      mapRef.current?.map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      id={`hf-map-${mapId}`}
      className="h-80 w-full bg-slate-100"
      role="img"
      aria-label="Map of nearby medical resources"
    />
  );
}
