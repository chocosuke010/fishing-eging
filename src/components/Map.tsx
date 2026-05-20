"use client";

import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Lightbulb, Car, Droplet, Leaf, Waves, Flower2 } from "lucide-react";
import { getPointWindStatus } from "@/lib/wind-utils";

export interface WindData {
  speed: number;
  angle: number;
}

interface MapProps {
  pointsData: any[];
  pointWinds: Record<string, WindData>;
  selectedPointId: string | null;
  onSelectPoint: (id: string | null) => void;
  currentLocation: { lat: number, lng: number } | null;
  isSpringMode: boolean;
  filters: {
    maxWindSpeed: number;
    windTolerance: "safe_only" | "allow_normal" | "all";
    requiredFeatures: string[];
  };
  isEditMode?: boolean;
  onMapClick?: (latlng: {lat: number, lng: number}) => void;
}

// A component to catch map clicks and deselect the point
function MapClickHandler({ onSelectPoint, isEditMode, onMapClick }: { onSelectPoint: (id: string | null) => void, isEditMode?: boolean, onMapClick?: (latlng: any) => void }) {
  useMapEvents({
    click: (e) => {
      if (isEditMode && onMapClick) {
        onMapClick(e.latlng);
      } else {
        onSelectPoint(null);
      }
    },
  });
  return null;
}

// Helper component for rendering feature badges
const FeatureBadge = ({ feature }: { feature: string }) => {
  switch (feature) {
    case "night_light":
      return (
        <span className="flex items-center gap-1.5 bg-yellow-950/40 text-yellow-300 text-xs font-medium px-2.5 py-1 rounded-md border border-yellow-700/50 shadow-sm">
          <Lightbulb className="w-3.5 h-3.5 text-yellow-400" /> 常夜灯あり
        </span>
      );
    case "parking":
      return (
        <span className="flex items-center gap-1.5 bg-blue-950/40 text-blue-300 text-xs font-medium px-2.5 py-1 rounded-md border border-blue-700/50 shadow-sm">
          <Car className="w-3.5 h-3.5 text-blue-400" /> 駐車場あり
        </span>
      );
    case "squid_ink_marks":
      return (
        <span className="flex items-center gap-1.5 bg-purple-950/40 text-purple-300 text-xs font-medium px-2.5 py-1 rounded-md border border-purple-700/50 shadow-sm">
          <Droplet className="w-3.5 h-3.5 text-purple-400" /> 墨跡実績あり
        </span>
      );
    default:
      return (
        <span className="bg-slate-800 text-slate-300 text-xs font-medium px-2.5 py-1 rounded-md border border-slate-700 shadow-sm">
          {feature}
        </span>
      );
  }
};

function LocationMarker({ location }: { location: { lat: number, lng: number } | null }) {
  const map = useMapEvents({});
  
  useEffect(() => {
    if (location) {
      map.flyTo([location.lat, location.lng], 13, {
        animate: true,
        duration: 1.5
      });
    }
  }, [location, map]);

  if (!location) return null;

  const html = `
    <div class="relative flex h-6 w-6 items-center justify-center">
      <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-500 opacity-75"></span>
      <span class="relative inline-flex h-4 w-4 rounded-full bg-blue-600 ring-2 ring-white shadow-[0_0_15px_rgba(37,99,235,0.8)]"></span>
    </div>
  `;

  const icon = L.divIcon({
    html,
    className: 'custom-location-marker',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -15],
  });

  return (
    <Marker position={[location.lat, location.lng]} icon={icon} zIndexOffset={1000}>
      <Popup className="custom-popup">
        <div className="p-2 text-slate-200">
          <h3 className="font-bold text-sm text-blue-400">現在地</h3>
        </div>
      </Popup>
    </Marker>
  );
}

export default function Map({ pointsData, pointWinds, selectedPointId, onSelectPoint, currentLocation, isSpringMode, filters, isEditMode, onMapClick }: MapProps) {
  // Center that can oversee Fukuoka, Saga, and Nagasaki (Itoshima, Yobuko, Hirado, Iki)
  const center: [number, number] = [33.4700, 129.7600];
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  // Create custom marker icons based on status
  const createMarkerIcon = (status: "safe" | "danger" | "normal", isSelected: boolean, point: any, isFilteredOut: boolean) => {
    let bgColor = "bg-slate-500";
    let ringColor = "ring-slate-400";
    let pulse = false;

    if (status === "safe") {
      bgColor = "bg-cyan-400";
      ringColor = "ring-cyan-300";
      pulse = true;
    } else if (status === "danger") {
      bgColor = "bg-red-500";
      ringColor = "ring-red-400";
    }

    const showSeaweed = isSpringMode && point.spring_eging?.has_seaweed;

    const html = `
      <div class="relative flex h-6 w-6 items-center justify-center transition-all duration-300 ${isFilteredOut ? 'opacity-20 grayscale scale-75' : ''}">
        ${pulse && !isFilteredOut ? `<span class="absolute inline-flex h-full w-full animate-ping rounded-full ${bgColor} opacity-75"></span>` : ''}
        <span class="relative inline-flex h-5 w-5 rounded-full ${bgColor} ring-2 ${ringColor} ring-offset-2 ring-offset-slate-900 shadow-[0_0_15px_rgba(0,0,0,0.5)] ${isSelected ? 'ring-4 ring-white' : ''}"></span>
        ${showSeaweed ? `<span class="absolute -top-3 -right-3 text-lg drop-shadow-md z-10">🌿</span>` : ''}
      </div>
    `;

    return L.divIcon({
      html,
      className: 'custom-marker',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, -15],
    });
  };

  return (
    <div className={`absolute inset-0 z-0 ${isEditMode ? 'leaflet-edit-cursor' : ''}`}>
      <MapContainer
        center={center}
        zoom={9}
        style={{ width: "100%", height: "100%" }}
        zoomControl={false}
      >
        <MapClickHandler onSelectPoint={onSelectPoint} isEditMode={isEditMode} onMapClick={onMapClick} />
        <LocationMarker location={currentLocation} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        {pointsData.map((point) => {
          let status: "safe" | "danger" | "normal" = "normal";
          const currentWind = pointWinds[point.id];
          
          if (currentWind) {
            status = getPointWindStatus(
              currentWind.speed,
              currentWind.angle,
              point.max_wind_tolerance,
              point.safe_wind_angles,
              point.danger_wind_angles
            );
          }

          // 高度フィルターの適用
          let isFilteredOut = false;
          if (currentWind) {
            if (currentWind.speed > filters.maxWindSpeed) isFilteredOut = true;
          }
          if (filters.windTolerance === "safe_only" && status !== "safe") isFilteredOut = true;
          if (filters.windTolerance === "allow_normal" && status === "danger") isFilteredOut = true;
          
          if (filters.requiredFeatures.includes("night_light") && !point.features.includes("night_light")) isFilteredOut = true;
          if (filters.requiredFeatures.includes("parking") && !point.features.includes("parking")) isFilteredOut = true;
          if (filters.requiredFeatures.includes("has_seaweed") && !point.spring_eging?.has_seaweed) isFilteredOut = true;
          if (filters.requiredFeatures.includes("shallow") && !point.spring_eging?.depth_type.includes("シャロー")) isFilteredOut = true;

          const isSelected = selectedPointId === point.id;

          return (
            <Marker
              key={point.id}
              position={[point.coordinates.lat, point.coordinates.lng]}
              icon={createMarkerIcon(status, isSelected, point, isFilteredOut)}
              eventHandlers={{
                click: () => onSelectPoint(point.id),
              }}
            >
              <Popup className="custom-popup">
                <div className="p-2 w-64 text-slate-200">
                  <h3 className="font-bold text-lg mb-2 text-white">{point.name}</h3>
                  <div className="mb-3">
                    {status === "safe" && <span className="text-sm font-semibold text-cyan-400 bg-cyan-950/50 border border-cyan-800/50 px-2 py-1 rounded">◎ 風裏で最適</span>}
                    {status === "danger" && <span className="text-sm font-semibold text-red-400 bg-red-950/50 border border-red-800/50 px-2 py-1 rounded">✕ 強風・向かい風</span>}
                    {status === "normal" && <span className="text-sm font-semibold text-slate-300 bg-slate-800 border border-slate-700 px-2 py-1 rounded">△ 通常</span>}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {point.features.map((feature: string) => (
                      <FeatureBadge key={feature} feature={feature} />
                    ))}
                  </div>

                  {/* 春イカモード限定情報 */}
                  {isSpringMode && point.spring_eging && (
                    <div className="flex flex-col gap-2 mt-4 pt-3 border-t border-slate-700/50">
                      <div className="text-xs font-bold text-pink-400 mb-1 flex items-center gap-1">
                        <Flower2 className="w-3.5 h-3.5" /> 春イカ攻略データ
                      </div>
                      
                      {point.spring_eging.has_seaweed ? (
                        <span className="flex w-fit items-center gap-1.5 bg-emerald-950/40 text-emerald-300 text-xs font-medium px-2.5 py-1.5 rounded-md border border-emerald-700/50 shadow-sm">
                          <Leaf className="w-3.5 h-3.5 text-emerald-400" />
                          藻場あり ({point.spring_eging.seaweed_type})
                        </span>
                      ) : (
                        <span className="flex w-fit items-center gap-1.5 bg-slate-800 text-slate-400 text-xs font-medium px-2.5 py-1.5 rounded-md border border-slate-700 shadow-sm">
                          藻場なし
                        </span>
                      )}
                      
                      <span className="flex w-fit items-center gap-1.5 bg-cyan-950/40 text-cyan-300 text-xs font-medium px-2.5 py-1.5 rounded-md border border-cyan-700/50 shadow-sm">
                        <Waves className="w-3.5 h-3.5 text-cyan-400" />
                        水深: {point.spring_eging.depth_type}
                      </span>
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
