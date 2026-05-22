"use client";

import { useEffect, useState, useMemo, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Moon, Droplets, MapPin, Loader2, ArrowUp, Flower2, Filter, SlidersHorizontal, X, Pencil, Save, Copy, Car, Cloud, Globe, LogOut, DownloadCloud, UploadCloud, CheckCircle2, AlertTriangle, Info } from "lucide-react"
import dynamic from "next/dynamic"
import Script from "next/script"
import pointsData from "@/data/points.json"
import { getWindDirectionString } from "@/lib/wind-utils"
import { getWeatherInfo } from "@/lib/weather-utils"

const Map = dynamic(() => import("@/components/Map"), { ssr: false })
const TideChart = dynamic(() => import("@/components/TideChart"), { ssr: false })

import { getTideDataForPoint, getCurrentTideStatus } from "@/lib/tide-utils"

export interface WindData {
  speed: number;
  angle: number;
  temperature: number;
  precipitation_prob: number;
  precipitation: number;
  weather_code: number;
}

export interface ForecastData {
  0: WindData;
  3: WindData;
  6: WindData;
}

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

export interface FilterState {
  maxWindSpeed: number;
  windTolerance: "safe_only" | "allow_normal" | "all";
  requiredFeatures: string[];
}

export default function Home() {
  const [pointForecasts, setPointForecasts] = useState<Record<string, ForecastData>>({});
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [showTideModal, setShowTideModal] = useState(false);

  // 潮位計算のための現在時刻（0〜23時の小数値）
  const currentHour = useMemo(() => {
    const now = new Date();
    return now.getHours() + now.getMinutes() / 60;
  }, []);

  // 選択中のポイントの潮汐情報
  const tideData = useMemo(() => {
    return getTideDataForPoint(selectedPointId);
  }, [selectedPointId]);

  // 現在時刻における潮高と上げ下げステータス
  const currentTideStatus = useMemo(() => {
    return getCurrentTideStatus(selectedPointId, currentHour);
  }, [selectedPointId, currentHour]);
  const [mapCenter, setMapCenter] = useState<{lat: number, lng: number} | null>(null);
  const [centerForecast, setCenterForecast] = useState<ForecastData | null>(null);
  const [loadingCenterWeather, setLoadingCenterWeather] = useState(false);
  const [formMemo, setFormMemo] = useState("");
  const [timeOffset, setTimeOffset] = useState<0 | 3 | 6>(0);
  const [loading, setLoading] = useState(true);
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isSpringMode, setIsSpringMode] = useState(false);
  
  // Point Registration Mode State
  const [customPoints, setCustomPoints] = useState<any[]>(pointsData);
  const [isEditMode, setIsEditMode] = useState(false);
  const [newPointLocation, setNewPointLocation] = useState<{lat: number, lng: number} | null>(null);
  const [editingPointId, setEditingPointId] = useState<string | null>(null);

  // Form State
  const [formName, setFormName] = useState("");
  const [formSafeWindDirections, setFormSafeWindDirections] = useState<string[]>([]);
  const [formFeatures, setFormFeatures] = useState<string[]>([]);
  const [formShallow, setFormShallow] = useState(false);
  const [formHasSeaweed, setFormHasSeaweed] = useState(false);

  // Google Drive Sync States
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isGoogleLinked, setIsGoogleLinked] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showSyncPopover, setShowSyncPopover] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  // localStorage からのデータロード
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("aorinavi_custom_points");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          const customOnly = parsed.filter((p: any) => p.isCustom || p.id.startsWith("custom_port_"));
          setCustomPoints([...pointsData, ...customOnly]);
        } catch (e) {
          console.error("Failed to load custom points from localStorage", e);
        }
      }
    }
  }, []);

  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    maxWindSpeed: 8,
    windTolerance: "allow_normal",
    requiredFeatures: []
  });

  // Responsive States
  const [isMobile, setIsMobile] = useState(false);
  const [isPanelExpanded, setIsPanelExpanded] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  // トースト表示用の補助関数
  const showToast = useCallback((message: string, type: "success" | "error" | "info" = "info") => {
    setToast({ message, type });
  }, []);

  // トースト自動消去用
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Google認証連携処理
  const handleLinkGoogle = () => {
    if (typeof window === "undefined" || !(window as any).google) {
      showToast("Google認証ライブラリをロード中です。数秒待って再試行してください。", "info");
      return;
    }
    
    let clientId = GOOGLE_CLIENT_ID;
    
    if (!clientId) {
      const customId = window.prompt(
        "Google Cloud OAuth クライアントIDが環境変数(NEXT_PUBLIC_GOOGLE_CLIENT_ID)に設定されていません。\nGoogle Cloud Consoleで取得したクライアントIDを入力してください。:\n(例: xxx.apps.googleusercontent.com)"
      );
      if (!customId) return;
      clientId = customId;
    }

    try {
      const client = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/drive.file",
        callback: (response: any) => {
          if (response.error) {
            console.error("GIS Error:", response);
            showToast(`連携エラー: ${response.error_description || response.error}`, "error");
            return;
          }
          if (response.access_token) {
            setAccessToken(response.access_token);
            setIsGoogleLinked(true);
            showToast("Google Driveと正常に連携しました！", "success");
            setShowSyncPopover(true);
          }
        },
      });
      client.requestAccessToken({ prompt: "consent" });
    } catch (err: any) {
      console.error("GIS Init Error:", err);
      showToast("Google連携の初期化に失敗しました。クライアントIDが正しいか確認してください。", "error");
    }
  };

  // Google Driveへバックアップ
  const backupToGoogleDrive = async () => {
    if (!accessToken) {
      showToast("先にGoogle連携を行ってください。", "error");
      return;
    }

    setIsSyncing(true);
    try {
      const query = encodeURIComponent("name='aorinavi_backup.json' and trashed=false");
      const searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!searchRes.ok) {
        throw new Error(`ファイル検索エラー: ${searchRes.statusText}`);
      }

      const searchData = await searchRes.json();
      const existingFile = searchData.files?.[0];
      const fileId = existingFile?.id;

      const saved = localStorage.getItem("aorinavi_custom_points") || "[]";

      if (fileId) {
        const uploadRes = await fetch(
          `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: saved,
          }
        );

        if (!uploadRes.ok) {
          throw new Error(`上書き保存エラー: ${uploadRes.statusText}`);
        }
      } else {
        const createRes = await fetch(
          `https://www.googleapis.com/drive/v3/files`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name: "aorinavi_backup.json",
              mimeType: "application/json",
            }),
          }
        );

        if (!createRes.ok) {
          throw new Error(`新規作成エラー: ${createRes.statusText}`);
        }

        const createdFile = await createRes.json();
        const newFileId = createdFile.id;

        const uploadRes = await fetch(
          `https://www.googleapis.com/upload/drive/v3/files/${newFileId}?uploadType=media`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: saved,
          }
        );

        if (!uploadRes.ok) {
          throw new Error(`中身のアップロードエラー: ${uploadRes.statusText}`);
        }
      }

      showToast("Google Driveにデータをバックアップしました！", "success");
    } catch (err: any) {
      console.error("Backup to Google Drive failed:", err);
      showToast(`バックアップに失敗しました: ${err.message || err}`, "error");
    } finally {
      setIsSyncing(false);
    }
  };

  // Google Driveからデータを復元
  const restoreFromGoogleDrive = async () => {
    if (!accessToken) {
      showToast("先にGoogle連携を行ってください。", "error");
      return;
    }

    if (!window.confirm("Google Driveからバックアップを復元します。\nローカルに保存されているカスタムポイントが上書きされます。よろしいですか？")) {
      return;
    }

    setIsSyncing(true);
    try {
      const query = encodeURIComponent("name='aorinavi_backup.json' and trashed=false");
      const searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!searchRes.ok) {
        throw new Error(`ファイル検索エラー: ${searchRes.statusText}`);
      }

      const searchData = await searchRes.json();
      const file = searchData.files?.[0];

      if (!file) {
        showToast("Google Drive上にバックアップデータが見つかりませんでした。", "error");
        return;
      }

      const downloadRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!downloadRes.ok) {
        throw new Error(`データダウンロードエラー: ${downloadRes.statusText}`);
      }

      const backupData = await downloadRes.json();

      if (!Array.isArray(backupData)) {
        throw new Error("バックアップデータのフォーマットが不正です。");
      }

      localStorage.setItem("aorinavi_custom_points", JSON.stringify(backupData));
      
      const customOnly = backupData.filter((p: any) => p.isCustom || p.id.startsWith("custom_port_"));
      setCustomPoints([...pointsData, ...customOnly]);

      showToast("Google Driveからデータを正常に復元しました！", "success");
    } catch (err: any) {
      console.error("Restore from Google Drive failed:", err);
      showToast(`復元に失敗しました: ${err.message || err}`, "error");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleMapClick = useCallback((latlng: {lat: number, lng: number}) => {
    setNewPointLocation(latlng);
  }, []);

  const handleMapMoveEnd = useCallback((latlng: {lat: number, lng: number}) => {
    setMapCenter(latlng);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // マーカー選択時・解除時のモバイルパネル自動制御
  useEffect(() => {
    if (isMobile) {
      if (selectedPointId) {
        setIsPanelExpanded(true);
      } else {
        setIsPanelExpanded(false);
      }
    }
  }, [selectedPointId, isMobile]);

  useEffect(() => {
    async function fetchWeather() {
      try {
        const lats = customPoints.map(p => p.coordinates.lat).join(",");
        const lngs = customPoints.map(p => p.coordinates.lng).join(",");
        
        // Fetch hourly data (for next 7 hours)
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&hourly=wind_speed_10m,wind_direction_10m,temperature_2m,precipitation_probability,precipitation,weather_code&wind_speed_unit=ms&forecast_hours=7`);
        let dataArray = await res.json();
        
        // Open-Meteo returns a single object if only one coordinate is requested
        if (!Array.isArray(dataArray) && customPoints.length === 1) {
          dataArray = [dataArray];
        } else if (!Array.isArray(dataArray)) {
          dataArray = [];
        }
        
        const newForecasts: Record<string, ForecastData> = {};
        if (Array.isArray(dataArray)) {
          dataArray.forEach((data: any, idx: number) => {
            if (data && data.hourly && customPoints[idx]) {
              const buildWeatherData = (offset: number) => ({
                speed: data.hourly.wind_speed_10m[offset],
                angle: data.hourly.wind_direction_10m[offset],
                temperature: data.hourly.temperature_2m[offset],
                precipitation_prob: Math.round(data.hourly.precipitation_probability[offset] / 10) * 10,
                precipitation: data.hourly.precipitation[offset],
                weather_code: data.hourly.weather_code[offset]
              });

              newForecasts[customPoints[idx].id] = {
                0: buildWeatherData(0),
                3: buildWeatherData(3),
                6: buildWeatherData(6),
              };
            }
          });
        }
        setPointForecasts(newForecasts);
      } catch (err) {
        console.error("Failed to fetch weather", err);
      } finally {
        setLoading(false);
      }
    }
    fetchWeather();
    
    const interval = setInterval(fetchWeather, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [customPoints.length]);

  // Map Center Weather Fetch with 500ms Debounce
  useEffect(() => {
    if (!mapCenter) return;

    setLoadingCenterWeather(true);
    const delayDebounce = setTimeout(async () => {
      try {
        const { lat, lng } = mapCenter;
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=wind_speed_10m,wind_direction_10m,temperature_2m,precipitation_probability,precipitation,weather_code&wind_speed_unit=ms&forecast_hours=7`);
        const data = await res.json();
        
        if (data && data.hourly) {
          const buildWeatherData = (offset: number) => ({
            speed: data.hourly.wind_speed_10m[offset],
            angle: data.hourly.wind_direction_10m[offset],
            temperature: data.hourly.temperature_2m[offset],
            precipitation_prob: Math.round(data.hourly.precipitation_probability[offset] / 10) * 10,
            precipitation: data.hourly.precipitation[offset],
            weather_code: data.hourly.weather_code[offset]
          });

          setCenterForecast({
            0: buildWeatherData(0),
            3: buildWeatherData(3),
            6: buildWeatherData(6),
          });
        }
      } catch (err) {
        console.error("Failed to fetch center weather", err);
      } finally {
        setLoadingCenterWeather(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounce);
  }, [mapCenter]);

  const displayWind = useMemo(() => {
    if (selectedPointId && pointForecasts[selectedPointId]) {
      return pointForecasts[selectedPointId][timeOffset];
    }
    if (centerForecast) {
      return centerForecast[timeOffset];
    }
    const forecasts = Object.values(pointForecasts);
    if (forecasts.length > 0) {
      const avgSpeed = forecasts.reduce((acc, curr) => acc + curr[timeOffset].speed, 0) / forecasts.length;
      const avgTemp = forecasts.reduce((acc, curr) => acc + curr[timeOffset].temperature, 0) / forecasts.length;
      let avgProb = Math.round(forecasts.reduce((acc, curr) => acc + curr[timeOffset].precipitation_prob, 0) / forecasts.length);
      avgProb = Math.round(avgProb / 10) * 10;
      const avgPrecipitation = forecasts.reduce((acc, curr) => acc + curr[timeOffset].precipitation, 0) / forecasts.length;
      return { 
        speed: avgSpeed, 
        angle: forecasts[0][timeOffset].angle,
        temperature: avgTemp,
        precipitation_prob: avgProb,
        precipitation: avgPrecipitation,
        weather_code: forecasts[0][timeOffset].weather_code
      };
    }
    return null;
  }, [selectedPointId, pointForecasts, centerForecast, timeOffset]);

  // Map only the current time offset's wind data for Map.tsx
  const currentPointWinds = useMemo(() => {
    const winds: Record<string, WindData> = {};
    for (const [id, forecast] of Object.entries(pointForecasts)) {
      winds[id] = forecast[timeOffset];
    }
    return winds;
  }, [pointForecasts, timeOffset]);

  const selectedPoint = customPoints.find(p => p.id === selectedPointId);
  const dashboardTitle = selectedPoint 
    ? selectedPoint.name 
    : mapCenter 
      ? `カーソル位置 (${mapCenter.lat.toFixed(4)}, ${mapCenter.lng.toFixed(4)})` 
      : "エリア全体 (平均)";

  const handleGetLocation = () => {
    setIsLocating(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCurrentLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setIsLocating(false);
        },
        (err) => {
          console.error("GPS error", err);
          alert("現在地を取得できませんでした。ブラウザの設定をご確認ください。");
          setIsLocating(false);
        }
      );
    } else {
      alert("お使いのブラウザはGPS機能に対応していません。");
      setIsLocating(false);
    }
  };

  const handleSavePoint = () => {
    if (!newPointLocation && !editingPointId) return;
    if (!formName) return;

    let updatedPoints: any[];
    if (editingPointId) {
      // 編集処理
      updatedPoints = customPoints.map(p => {
        if (p.id === editingPointId) {
          return {
            ...p,
            name: formName,
            safeWindDirections: formSafeWindDirections,
            max_wind_tolerance: 5.0,
            features: formFeatures,
            memo: formMemo,
            spring_eging: {
              ...p.spring_eging,
              has_seaweed: formHasSeaweed,
              seaweed_type: formHasSeaweed ? (p.spring_eging?.seaweed_type || "未設定") : "",
              depth_type: formShallow ? "シャロー" : "ディープ"
            }
          };
        }
        return p;
      });
    } else {
      // 新規作成処理
      if (!newPointLocation) return;
      const newPoint = {
        id: `custom_port_${Date.now()}`,
        name: formName,
        coordinates: { lat: newPointLocation.lat, lng: newPointLocation.lng },
        safeWindDirections: formSafeWindDirections,
        max_wind_tolerance: 5.0,
        features: formFeatures,
        memo: formMemo,
        isCustom: true,
        spring_eging: {
          has_seaweed: formHasSeaweed,
          seaweed_type: formHasSeaweed ? "未設定" : "",
          depth_type: formShallow ? "シャロー" : "ディープ"
        }
      };
      updatedPoints = [...customPoints, newPoint];
    }

    setCustomPoints(updatedPoints);

    // localStorageへ保存（カスタムポイントのみ）
    const customOnly = updatedPoints.filter(p => p.isCustom || p.id.startsWith("custom_port_"));
    localStorage.setItem("aorinavi_custom_points", JSON.stringify(customOnly));

    // フォームとモーダルのクリア
    handleCancelSave();
  };

  const handleCancelSave = () => {
    setNewPointLocation(null);
    setEditingPointId(null);
    setFormName("");
    setFormSafeWindDirections([]);
    setFormFeatures([]);
    setFormMemo("");
    setFormHasSeaweed(false);
    setFormShallow(false);
  };

  const handleEditPoint = (point: any) => {
    setEditingPointId(point.id);
    setFormName(point.name);
    setFormSafeWindDirections(point.safeWindDirections || []);
    setFormFeatures(point.features || []);
    setFormMemo(point.memo || "");
    setFormHasSeaweed(point.spring_eging?.has_seaweed || false);
    setFormShallow(point.spring_eging?.depth_type.includes("シャロー") || false);
    setNewPointLocation({ lat: point.coordinates.lat, lng: point.coordinates.lng });
  };

  const handleDeletePoint = (id: string) => {
    if (!window.confirm("このポイントを削除してもよろしいですか？")) return;

    const updatedPoints = customPoints.filter(p => p.id !== id);
    setCustomPoints(updatedPoints);

    const customOnly = updatedPoints.filter(p => p.isCustom || p.id.startsWith("custom_port_"));
    localStorage.setItem("aorinavi_custom_points", JSON.stringify(customOnly));

    setSelectedPointId(null);
  };

  const handleExportJson = () => {
    const jsonString = JSON.stringify(customPoints, null, 2);
    navigator.clipboard.writeText(jsonString).then(() => {
      alert("現在の全ポイントデータをクリップボードにコピーしました！\n（points.jsonに上書きして保存できます）");
    });
  };

  const isOverlayActive = showTideModal || showMenu || !!newPointLocation || (isMobile && isPanelExpanded);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-950 text-slate-200">
      {/* Header */}
      <header className="h-20 flex-none bg-slate-900/90 backdrop-blur-md border-b border-slate-800 flex items-center px-4 md:px-6 shadow-md z-10 relative">
        <h1 className="text-xl md:text-2xl font-black flex items-center gap-2 md:gap-3 tracking-tight cursor-pointer select-none" onClick={() => setSelectedPointId(null)}>
          <Droplets className="w-6 h-6 md:w-8 md:h-8 text-cyan-400 animate-pulse flex-shrink-0" />
          <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            アオリナビ
          </span>
          <span className="font-extralight text-slate-300 tracking-wider text-xs md:text-sm px-1.5 py-0.5 rounded border border-slate-700/60 bg-slate-950/80 shadow-[0_0_10px_rgba(255,255,255,0.05)]">
            OS
          </span>
        </h1>
        
        <div className="ml-auto flex items-center gap-2 md:gap-3">
          {/* 春イカモード (モバイルも常時表示) */}
          <button 
            onClick={() => setIsSpringMode(!isSpringMode)}
            className={`flex items-center gap-1.5 text-xs md:text-sm font-bold py-1.5 px-2.5 md:px-3 rounded-lg transition-all ${isSpringMode ? 'bg-pink-500/20 text-pink-400 border border-pink-500/50 shadow-[0_0_10px_rgba(236,72,153,0.3)]' : 'bg-slate-800/80 text-slate-400 border border-slate-700 hover:bg-slate-700 hover:text-slate-200'}`}
          >
            <Flower2 className={`w-4 h-4 ${isSpringMode ? 'animate-pulse' : ''}`} />
            {isMobile ? "春イカ" : "春イカモード"}
          </button>
          
          {/* フィルターボタン */}
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 text-xs md:text-sm font-bold py-1.5 px-2.5 md:px-3 rounded-lg transition-all ${showFilters ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.3)]' : 'bg-slate-800/80 text-slate-300 border border-slate-700 hover:bg-slate-700 hover:text-slate-200'}`}
          >
            <Filter className="w-4 h-4" />
            {!isMobile && "フィルター"}
          </button>
          
          {/* 現在地へ移動 */}
          <button 
            onClick={handleGetLocation}
            disabled={isLocating}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs md:text-sm font-bold py-1.5 px-2.5 md:px-3 rounded-lg transition-colors disabled:opacity-50"
          >
            {isLocating ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
            {!isMobile && "現在地"}
          </button>

          {/* デスクトップ用管理機能 */}
          {!isMobile ? (
            <>
              <div className="w-px h-6 bg-slate-700/80 mx-1"></div>
              {/* Edit Mode Toggle */}
              <button 
                onClick={() => setIsEditMode(!isEditMode)}
                className={`flex items-center gap-1.5 text-sm font-bold py-1.5 px-3 rounded-lg transition-all ${isEditMode ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.3)]' : 'bg-slate-800/80 text-slate-400 border border-slate-700 hover:bg-slate-700 hover:text-slate-200'}`}
              >
                <Pencil className={`w-4 h-4 ${isEditMode ? 'animate-bounce' : ''}`} />
                ポイント登録
              </button>
              
              <button 
                onClick={handleExportJson}
                className={`flex items-center gap-1.5 text-sm font-bold py-1.5 px-3 rounded-lg transition-colors bg-slate-800/80 text-slate-300 border border-slate-700 hover:bg-slate-700 hover:text-slate-200`}
                title="ポイントデータをエクスポート"
              >
                <Copy className="w-4 h-4" />
                エクスポート
              </button>

              {/* Google Drive 同期ポップオーバー */}
              <div className="relative">
                <button
                  onClick={() => setShowSyncPopover(!showSyncPopover)}
                  className={`flex items-center gap-1.5 text-sm font-bold py-1.5 px-3 rounded-lg transition-all ${
                    isGoogleLinked
                      ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                      : 'bg-slate-800/80 text-slate-350 border border-slate-700 hover:bg-slate-700 hover:text-slate-200'
                  }`}
                  title="Google Driveクラウド同期"
                >
                  <Cloud className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                  クラウド同期
                  {isGoogleLinked && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  )}
                </button>

                {showSyncPopover && (
                  <div className="absolute right-0 mt-2.5 w-72 bg-slate-900/95 backdrop-blur-md border border-slate-700/60 rounded-xl p-4 shadow-2xl z-[150] animate-in fade-in slide-in-from-top-2 duration-150 text-left">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
                      <h4 className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
                        <Cloud className="w-4 h-4 text-cyan-400" />
                        Google Drive 同期
                      </h4>
                      <button
                        onClick={() => setShowSyncPopover(false)}
                        className="text-slate-400 hover:text-white p-0.5 rounded bg-slate-850 hover:bg-slate-800 border border-slate-750 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex flex-col gap-3">
                      {!isGoogleLinked ? (
                        <>
                          <p className="text-xs text-slate-400 leading-normal">
                            Google Driveと連携し、カスタムポイントデータをクラウドにバックアップ・復元できます。
                          </p>
                          <button
                            onClick={handleLinkGoogle}
                            className="flex items-center justify-center gap-2 w-full bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs md:text-sm py-2 px-3 rounded-lg transition-colors shadow-md"
                          >
                            <Globe className="w-4 h-4 text-blue-500" />
                            Google アカウントと連携
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center justify-between bg-slate-950/60 border border-slate-800 rounded-lg p-2.5">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                              <span className="text-xs text-slate-350 font-bold">連携中</span>
                            </div>
                            <button
                              onClick={() => {
                                setAccessToken(null);
                                setIsGoogleLinked(false);
                                showToast("Google連携を解除しました。", "info");
                              }}
                              className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 bg-red-950/20 px-2 py-0.5 rounded border border-red-900/30 transition-colors"
                            >
                              <LogOut className="w-3.5 h-3.5" />
                              解除
                            </button>
                          </div>

                          <div className="flex flex-col gap-2">
                            <button
                              onClick={backupToGoogleDrive}
                              disabled={isSyncing}
                              className="flex items-center justify-center gap-2 w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs md:text-sm py-2 px-3 rounded-lg transition-colors shadow-md disabled:opacity-50"
                            >
                              <UploadCloud className="w-4 h-4" />
                              Driveへバックアップ
                            </button>

                            <button
                              onClick={restoreFromGoogleDrive}
                              disabled={isSyncing}
                              className="flex items-center justify-center gap-2 w-full bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs md:text-sm py-2 px-3 rounded-lg transition-colors shadow-md disabled:opacity-50"
                            >
                              <DownloadCloud className="w-4 h-4" />
                              Driveから復元
                            </button>
                          </div>
                          
                          <p className="text-[10px] text-slate-500 leading-normal text-center mt-1">
                            データは `aorinavi_backup.json` に保存されます。
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            // モバイル用設定メニュー
            <button
              onClick={() => setShowMenu(true)}
              className="flex items-center justify-center p-2 rounded-lg transition-colors bg-slate-800/80 text-slate-400 border border-slate-700"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* Mobile Setting Drawer (Modal) */}
      {isMobile && showMenu && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <Card className="w-full max-w-xs bg-slate-900 border-slate-700 shadow-2xl rounded-2xl overflow-hidden animate-in fade-in zoom-in duration-200 relative">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-amber-400 to-orange-500"></div>
            <CardHeader className="pb-4 pt-6 border-b border-slate-800">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-amber-400" />
                  管理メニュー
                </CardTitle>
                <button onClick={() => setShowMenu(false)} className="text-slate-400 hover:text-white transition-colors bg-slate-800 hover:bg-slate-700 p-1 rounded-md">
                  <X className="w-4 h-4"/>
                </button>
              </div>
            </CardHeader>
            <CardContent className="pt-6 flex flex-col gap-3 pb-6">
              <button 
                onClick={() => {
                  setIsEditMode(!isEditMode);
                  setShowMenu(false);
                }}
                className={`flex items-center justify-center gap-2 w-full text-sm font-bold py-2.5 px-4 rounded-xl transition-all ${isEditMode ? 'bg-amber-500 text-white shadow-[0_0_15px_rgba(245,158,11,0.4)]' : 'bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700'}`}
              >
                <Pencil className="w-4 h-4" />
                {isEditMode ? '登録モードを解除' : 'ポイント登録モード'}
              </button>
              
              <button 
                onClick={() => {
                  handleExportJson();
                  setShowMenu(false);
                }}
                className="flex items-center justify-center gap-2 w-full text-sm font-bold py-2.5 px-4 rounded-xl bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 transition-colors"
              >
                <Copy className="w-4 h-4" />
                現在のデータをコピー
              </button>

              <div className="h-px bg-slate-800 my-2"></div>

              {/* モバイル用 Google Drive クラウド同期 */}
              <div className="flex flex-col gap-3 bg-slate-950/30 p-3 rounded-xl border border-slate-850">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-350">
                  <Cloud className="w-4 h-4 text-cyan-400" />
                  クラウドバックアップ (Google Drive)
                </div>

                {!isGoogleLinked ? (
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      setTimeout(handleLinkGoogle, 300);
                    }}
                    className="flex items-center justify-center gap-2 w-full bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs py-2 px-3 rounded-lg transition-colors shadow-md"
                  >
                    <Globe className="w-4 h-4 text-blue-500" />
                    Googleアカウントと連携
                  </button>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between bg-slate-900 border border-slate-850 p-2 rounded-lg text-xs">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        連携中
                      </span>
                      <button
                        onClick={() => {
                          setAccessToken(null);
                          setIsGoogleLinked(false);
                          showToast("Google連携を解除しました。", "info");
                        }}
                        className="text-red-400 hover:text-red-300 font-bold text-[10px]"
                      >
                        連携解除
                      </button>
                    </div>

                    <button
                      onClick={() => {
                        setShowMenu(false);
                        setTimeout(backupToGoogleDrive, 300);
                      }}
                      disabled={isSyncing}
                      className="flex items-center justify-center gap-2 w-full bg-cyan-600 text-white font-bold text-xs py-2 px-3 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <UploadCloud className="w-4 h-4" />
                      Driveへバックアップ
                    </button>

                    <button
                      onClick={() => {
                        setShowMenu(false);
                        setTimeout(restoreFromGoogleDrive, 300);
                      }}
                      disabled={isSyncing}
                      className="flex items-center justify-center gap-2 w-full bg-slate-800 text-slate-200 border border-slate-700 font-bold text-xs py-2 px-3 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <DownloadCloud className="w-4 h-4" />
                      Driveから復元
                    </button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex relative overflow-hidden">
        {/* Map Area */}
        <div className="flex-1 bg-slate-950 relative h-full">
          <Map 
            pointsData={customPoints}
            pointWinds={currentPointWinds} 
            selectedPointId={selectedPointId}
            onSelectPoint={setSelectedPointId}
            currentLocation={currentLocation}
            isSpringMode={isSpringMode}
            filters={filters}
            isEditMode={isEditMode}
            onMapClick={handleMapClick}
            onMapMoveEnd={handleMapMoveEnd}
            onEditPoint={handleEditPoint}
            onDeletePoint={handleDeletePoint}
          />

          {/* マップ中央の照準十字カーソル */}
          <div 
            className={`absolute inset-0 pointer-events-none flex items-center justify-center transition-all duration-300 ease-in-out ${
              isOverlayActive ? 'opacity-0 scale-90' : 'opacity-100 scale-100'
            }`}
            style={{ zIndex: 40 }}
          >
            <div className="relative flex items-center justify-center">
              {/* 横線 */}
              <div 
                className="absolute w-8 h-[2px] bg-cyan-400 opacity-80"
                style={{ boxShadow: "0 0 8px rgba(34, 211, 238, 0.6)" }}
              ></div>
              {/* 縦線 */}
              <div 
                className="absolute h-8 w-[2px] bg-cyan-400 opacity-80"
                style={{ boxShadow: "0 0 8px rgba(34, 211, 238, 0.6)" }}
              ></div>
              {/* 中央の小さなドット */}
              <div 
                className="w-2.5 h-2.5 rounded-full bg-cyan-300 ring-2 ring-cyan-500/50"
                style={{ boxShadow: "0 0 12px rgba(34, 211, 238, 1)" }}
              ></div>
            </div>
          </div>
        </div>

        {/* Filter Panel (Desktop vs Mobile overlay) */}
        <div className={
          isMobile 
            ? `fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[250] flex items-end justify-center p-0 transition-all duration-300 ${showFilters ? 'opacity-100' : 'opacity-0 pointer-events-none'}`
            : `absolute top-6 right-6 w-[340px] z-[60] transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${showFilters ? 'translate-x-0 opacity-100' : 'translate-x-12 opacity-0 pointer-events-none'}`
        }>
          <Card className={`bg-slate-900/95 backdrop-blur-xl border-slate-700/60 shadow-2xl overflow-hidden ${
            isMobile 
              ? `w-full rounded-t-3xl border-t border-slate-800 max-h-[85vh] overflow-y-auto transition-transform duration-300 ${showFilters ? 'translate-y-0' : 'translate-y-full'}`
              : `rounded-2xl`
          }`}>
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-cyan-500 to-blue-600"></div>
            <CardHeader className="pb-3 pt-5 border-b border-slate-800/80">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold text-slate-200 flex items-center gap-2 tracking-wide">
                  <SlidersHorizontal className="w-5 h-5 text-cyan-400" />
                  高度フィルター
                </CardTitle>
                <button onClick={() => setShowFilters(false)} className="text-slate-400 hover:text-white transition-colors bg-slate-800 hover:bg-slate-700 p-1.5 rounded-lg">
                  <X className="w-4 h-4"/>
                </button>
              </div>
            </CardHeader>
            <CardContent className="pt-5 flex flex-col gap-6 pb-8 px-5">
              {/* Wind Speed Slider */}
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                    許容風速
                  </span>
                  <span className="text-cyan-400 font-bold bg-cyan-950/50 px-2 py-0.5 rounded text-xs border border-cyan-800/50">
                    {filters.maxWindSpeed} m/s 以下
                  </span>
                </div>
                <input 
                  type="range" min="1" max="10" step="1" 
                  value={filters.maxWindSpeed} 
                  onChange={e => setFilters({...filters, maxWindSpeed: Number(e.target.value)})}
                  className="w-full accent-cyan-500 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 px-1">
                  <span>1m/s</span>
                  <span>10m/s</span>
                </div>
              </div>

              {/* Wind Tolerance */}
              <div className="flex flex-col gap-3">
                <span className="text-slate-300 text-sm font-semibold">風向きの許容度</span>
                <div className="flex flex-col gap-1.5">
                  <button 
                    onClick={() => setFilters({...filters, windTolerance: "safe_only"})}
                    className={`text-left text-xs px-3 py-2 rounded-xl border transition-colors ${filters.windTolerance === "safe_only" ? 'bg-cyan-900/40 border-cyan-500 text-cyan-300 font-bold' : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                  >
                    🔵 完全に風裏（追い風）のみ
                  </button>
                  <button 
                    onClick={() => setFilters({...filters, windTolerance: "allow_normal"})}
                    className={`text-left text-xs px-3 py-2 rounded-xl border transition-colors ${filters.windTolerance === "allow_normal" ? 'bg-cyan-900/40 border-cyan-500 text-cyan-300 font-bold' : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                  >
                    ⚪️ 横風・微風（通常）まで許容
                  </button>
                  <button 
                    onClick={() => setFilters({...filters, windTolerance: "all"})}
                    className={`text-left text-xs px-3 py-2 rounded-xl border transition-colors ${filters.windTolerance === "all" ? 'bg-cyan-900/40 border-cyan-500 text-cyan-300 font-bold' : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                  >
                    🔴 すべて表示（強風も含む）
                  </button>
                </div>
              </div>

              {/* Feature Toggles */}
              <div className="flex flex-col gap-3">
                <span className="text-slate-300 text-sm font-semibold">地形・設備条件</span>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: "night_light", label: "💡 常夜灯あり" },
                    { id: "parking", label: "🚗 駐車場あり" },
                    { id: "has_seaweed", label: "🌿 藻場あり" },
                    { id: "shallow", label: "🌊 シャロー" }
                  ].map(feature => {
                    const isActive = filters.requiredFeatures.includes(feature.id);
                    return (
                      <button
                        key={feature.id}
                        onClick={() => {
                          if (isActive) {
                            setFilters({...filters, requiredFeatures: filters.requiredFeatures.filter(f => f !== feature.id)});
                          } else {
                            setFilters({...filters, requiredFeatures: [...filters.requiredFeatures, feature.id]});
                          }
                        }}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${isActive ? 'bg-cyan-900/50 border-cyan-500 text-cyan-300 font-bold shadow-[0_0_8px_rgba(6,182,212,0.3)]' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200'}`}
                      >
                        {feature.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Info Panel (Floating Desktop vs Bottom Sheet Mobile) */}
        <div className={
          isMobile 
            ? `absolute bottom-0 left-0 right-0 w-full z-50 pointer-events-auto transition-all duration-300`
            : `absolute top-6 left-6 w-[460px] flex flex-col gap-4 z-50 pointer-events-none transition-all duration-300`
        }>
          <Card className={`bg-slate-900/90 backdrop-blur-xl border-slate-700/60 shadow-2xl pointer-events-auto overflow-hidden flex flex-col ${
            isMobile 
              ? `rounded-t-3xl border-t border-slate-800/80 transition-all duration-300 ${isPanelExpanded ? 'max-h-[60vh]' : 'h-[80px]'}`
              : `rounded-2xl`
          }`}>
            <div className={`absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r ${selectedPointId ? 'from-green-400 to-cyan-500' : 'from-blue-500 to-cyan-400'} z-10`}></div>
            
            {/* Mobile Expand/Collapse Bar */}
            {isMobile && (
              <div 
                className="w-full flex justify-center pt-3 pb-2 cursor-pointer hover:bg-slate-800/30 shrink-0 relative z-10"
                onClick={() => setIsPanelExpanded(!isPanelExpanded)}
              >
                <div className="w-12 h-1.5 bg-slate-500 rounded-full"></div>
              </div>
            )}

            {/* Panel Content */}
            {isMobile && !isPanelExpanded ? (
              // モバイルの折りたたみ（最小化）表示：1行のサマリー
              <div 
                className="flex items-center justify-between px-5 h-[56px] cursor-pointer"
                onClick={() => setIsPanelExpanded(true)}
              >
                <div className="flex flex-col justify-center">
                  <div className="text-[10px] font-bold text-slate-400 leading-tight">現在選択中</div>
                  <h3 className="font-black text-sm text-white truncate max-w-[150px]">{dashboardTitle}</h3>
                </div>

                <div className="flex items-center gap-3">
                  {displayWind && (
                    <>
                      {/* 天気アイコンと気温 */}
                      {(() => {
                        const weather = getWeatherInfo(displayWind.weather_code);
                        const Icon = weather.icon;
                        return (
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                            <Icon className={`w-4 h-4 ${weather.color}`} />
                            <span>{displayWind.temperature.toFixed(0)}°C</span>
                          </div>
                        );
                      })()}
                      
                      {/* 風速と矢印 */}
                      <div className="flex items-center gap-1 bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
                        <ArrowUp 
                          className="w-3.5 h-3.5 text-cyan-400" 
                          style={{ transform: `rotate(${displayWind.angle + 180}deg)` }}
                        />
                        <span className="font-black text-sm text-cyan-400">{displayWind.speed.toFixed(1)}</span>
                        <span className="text-[9px] text-slate-500 font-bold">m/s</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              // 通常表示（デスクトップ、およびモバイルの展開時）
              <div className={`flex flex-col px-5 pb-6 pt-2 overflow-y-auto flex-1`}>
                <CardHeader className="p-0 pb-3 flex flex-row items-center justify-between sticky top-0 bg-slate-900/95 backdrop-blur z-20 pt-1">
                  <CardTitle className="text-lg font-bold text-slate-400 tracking-wider flex items-center gap-2">
                    <span className="truncate max-w-[200px]">{dashboardTitle}</span>
                    {loading && <Loader2 className="w-5 h-5 animate-spin text-cyan-500" />}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {isMobile && (
                      <button
                        onClick={() => {
                          if (selectedPointId) setSelectedPointId(null);
                          else setIsPanelExpanded(false);
                        }}
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-full transition-colors border border-slate-700"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </CardHeader>

                {selectedPoint && (
                  <div className="mb-2 flex flex-col gap-2">
                    <button
                      onClick={() => {
                        const url = `https://www.google.com/maps/dir/?api=1&destination=${selectedPoint.coordinates.lat},${selectedPoint.coordinates.lng}`;
                        window.open(url, '_blank');
                      }}
                      className="flex items-center justify-center gap-2 w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs md:text-sm font-bold py-2 px-4 rounded-xl transition-all shadow-[0_0_15px_rgba(37,99,235,0.3)] hover:shadow-[0_0_20px_rgba(37,99,235,0.5)] active:scale-[0.98]"
                    >
                      <Car className="w-4 h-4 text-white animate-pulse" />
                      Googleマップでナビ
                    </button>
                    
                    {(selectedPoint.isCustom || selectedPoint.id.startsWith("custom_port_")) && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditPoint(selectedPoint)}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-350 hover:text-white text-xs font-bold py-2 rounded-xl transition-colors border border-slate-700/50"
                        >
                          <Pencil className="w-4 h-4 text-cyan-400" />
                          編集
                        </button>
                        <button
                          onClick={() => handleDeletePoint(selectedPoint.id)}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-red-950/40 hover:bg-red-900/40 text-red-450 hover:text-red-300 text-xs font-bold py-2 rounded-xl transition-colors border border-red-900/30"
                        >
                          <X className="w-4 h-4 text-red-400" />
                          削除
                        </button>
                      </div>
                    )}
                  </div>
                )}
                
                <div className="flex flex-col gap-5">
                  {/* Visual Wind Indicator (Windy style) */}
                  <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center gap-5 text-slate-200">
                      {/* Compass / Arrow */}
                      <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-slate-800/80 border-2 border-slate-600/50 flex items-center justify-center relative shadow-inner">
                        <span className="absolute top-1 text-[9px] text-slate-500 font-bold">N</span>
                        <span className="absolute bottom-1 text-[9px] text-slate-500 font-bold">S</span>
                        <span className="absolute right-1.5 text-[9px] text-slate-500 font-bold">E</span>
                        <span className="absolute left-1.5 text-[9px] text-slate-500 font-bold">W</span>
                        
                        {displayWind ? (
                          <div 
                            className="transition-transform duration-1000 ease-out flex items-center justify-center"
                            style={{ transform: `rotate(${displayWind.angle + 180}deg)` }}
                          >
                            <ArrowUp className="w-10 h-10 md:w-12 md:h-12 text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]" strokeWidth={3} />
                          </div>
                        ) : (
                          <div className="w-3.5 h-3.5 rounded-full bg-slate-600"></div>
                        )}
                      </div>
                      
                      {/* Speed */}
                      <div className="flex flex-col justify-center">
                        <div className="text-xs md:text-sm font-semibold text-slate-400 mb-[-4px]">
                          {displayWind ? getWindDirectionString(displayWind.angle) + "からの風" : "---"}
                        </div>
                        <div className="flex items-baseline gap-1.5">
                          <span className="font-black text-5xl md:text-6xl tracking-tighter text-white drop-shadow-md">
                            {displayWind ? displayWind.speed.toFixed(1) : '--'}
                          </span>
                          <span className="text-xl md:text-2xl font-bold text-slate-400">m/s</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Weather Info */}
                  {displayWind && (
                    <div className="flex items-center justify-between bg-slate-800/40 rounded-2xl p-3 md:p-4 border border-slate-700/50">
                      {(() => {
                        const weather = getWeatherInfo(displayWind.weather_code);
                        const Icon = weather.icon;
                        return (
                          <div className="flex items-center gap-3">
                            <div className="bg-slate-900/60 p-2.5 rounded-full shadow-inner">
                              <Icon className={`w-6 h-6 md:w-8 md:h-8 ${weather.color}`} />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-xs md:text-sm font-semibold text-slate-400">{weather.text}</span>
                              <div className="flex items-baseline gap-1">
                                <span className="text-2xl md:text-3xl font-black text-slate-100">{displayWind.temperature.toFixed(1)}</span>
                                <span className="text-base md:text-lg font-bold text-slate-400">°C</span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                      <div className="flex flex-col items-end border-l border-slate-700/80 pl-4 md:pl-6">
                        <span className="text-xs md:text-sm font-semibold text-slate-400">降水確率</span>
                        <div className="flex items-baseline gap-0.5">
                          <span className="text-2xl md:text-3xl font-black text-blue-400">{displayWind.precipitation_prob}</span>
                          <span className="text-base md:text-lg font-bold text-blue-500/70">%</span>
                        </div>
                        {displayWind.precipitation > 0 && (
                          <div className="text-[10px] md:text-xs font-semibold text-blue-300 mt-1 text-right">
                            降水量: {displayWind.precipitation.toFixed(1)} mm/h
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Tide / Moon Info (Click to open Modal) */}
                  <div 
                    onClick={() => setShowTideModal(true)}
                    className="grid grid-cols-2 gap-4 border-t border-slate-700/85 pt-4 cursor-pointer hover:bg-slate-800/30 rounded-xl p-3.5 transition-all duration-300 group hover:shadow-[0_0_15px_rgba(34,211,238,0.05)] border border-transparent hover:border-slate-800"
                    title="潮見表・潮汐グラフを表示"
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 text-slate-400 text-sm md:text-base font-bold group-hover:text-slate-350 transition-colors">
                        <Moon className="w-5 h-5 text-yellow-400/90 group-hover:animate-pulse" />
                        Moon
                      </div>
                      <span className="text-base md:text-lg font-bold text-slate-100 group-hover:text-cyan-400 transition-colors">
                        {tideData.tideType}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 text-slate-400 text-sm md:text-base font-bold group-hover:text-slate-350 transition-colors">
                        <Droplets className="w-5 h-5 text-cyan-400/90 group-hover:animate-bounce" />
                        Tide
                      </div>
                      <span className="text-base md:text-lg font-bold text-slate-100 group-hover:text-cyan-400 transition-colors flex items-center gap-1.5">
                        {tideData.highTides[0]?.time ? `満潮 ${tideData.highTides[0].time}` : "データなし"}
                      </span>
                    </div>
                    
                    {/* 現在の潮位・上げ下げのインジケーター */}
                    <div className="col-span-2 flex items-center justify-between text-xs text-cyan-400 bg-cyan-950/30 px-3 py-1.5 rounded-lg border border-cyan-800/30 mt-1">
                      <div className="flex items-center gap-1.5">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                        </span>
                        <span className="font-bold">現在潮位: {currentTideStatus.currentLevel} cm</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black tracking-wider ${
                        currentTideStatus.statusText === "上げ潮" 
                          ? "bg-emerald-950/80 text-emerald-300 border border-emerald-800/40" 
                          : currentTideStatus.statusText === "下げ潮"
                            ? "bg-blue-950/80 text-blue-300 border border-blue-800/40"
                            : "bg-slate-800 text-slate-300 border border-slate-700"
                      }`}>
                        {currentTideStatus.statusText}
                      </span>
                    </div>
                  </div>

                  {/* Memo Section */}
                  {selectedPoint && selectedPoint.memo && (
                    <div className="border-t border-slate-700/85 pt-4 flex flex-col gap-2">
                      <div className="flex items-center gap-1.5 text-slate-400 text-sm font-bold">
                        <Pencil className="w-4 h-4 text-cyan-400" />
                        ポイントメモ
                      </div>
                      <div className="bg-slate-950/40 rounded-xl p-3.5 border border-slate-800 text-xs md:text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                        {selectedPoint.memo}
                      </div>
                    </div>
                  )}

                  {/* Time Slider (Forecast) */}
                  <div className="border-t border-slate-700/85 pt-4">
                    <div className="text-xs md:text-sm font-semibold text-slate-400 mb-2.5">風予測（タイムスライダー）</div>
                    <div className="flex items-center bg-slate-950/50 rounded-xl p-1 border border-slate-700/50">
                      {[0, 3, 6].map((offset) => (
                        <button
                          key={offset}
                          onClick={() => setTimeOffset(offset as 0 | 3 | 6)}
                          className={`flex-1 py-1.5 text-xs md:text-sm font-bold rounded-lg transition-all ${
                            timeOffset === offset
                              ? 'bg-blue-600 text-white shadow-md'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                          }`}
                        >
                          {offset === 0 ? "現在" : `${offset}時間後`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* New Point Registration Modal */}
        {newPointLocation && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4">
            <Card className="w-full max-w-md bg-slate-900 border-slate-700 shadow-2xl rounded-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-amber-400 to-orange-500"></div>
              <CardHeader className="pb-4 pt-6 border-b border-slate-800">
                <CardTitle className="text-xl font-bold text-slate-100 flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-amber-400" />
                  {editingPointId ? "ポイントの編集" : "新規ポイントの登録"}
                </CardTitle>
                <div className="text-xs text-slate-400 mt-1 font-mono">
                  Lat: {newPointLocation.lat.toFixed(5)}, Lng: {newPointLocation.lng.toFixed(5)}
                </div>
              </CardHeader>
              <CardContent className="pt-6 flex flex-col gap-5 max-h-[60vh] overflow-y-auto pr-1">
                {/* Point Name */}
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-slate-300">ポイント名</label>
                  <input 
                    type="text" 
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="例: 〇〇漁港 外波止"
                    className="bg-slate-950 border border-slate-700 text-slate-100 p-2.5 rounded-md focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all"
                  />
                </div>

                {/* Wind Directions Compass Grid */}
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-slate-300">風裏になる風向き（複数選択可）</label>
                  <p className="text-xs text-slate-500 leading-normal">
                    背中から風を受けられる、または地形によって風が遮られる『釣りがしやすい風向き』を選択してください。（例：北側に山がある場合は「北」を選択）
                  </p>
                  
                  <div className="flex justify-center my-2">
                    <div className="grid grid-cols-3 gap-2 w-60 h-60 p-2.5 bg-slate-950/60 rounded-2xl border border-slate-800">
                      {(() => {
                        const directions = [
                          { key: "北西", label: "NW" },
                          { key: "北", label: "N" },
                          { key: "北東", label: "NE" },
                          { key: "西", label: "W" },
                          { key: "center", label: "🧭" },
                          { key: "東", label: "E" },
                          { key: "南西", label: "SW" },
                          { key: "南", label: "S" },
                          { key: "南東", label: "SE" },
                        ];
                        
                        return directions.map((d, idx) => {
                          if (d.key === "center") {
                            return (
                              <div key={idx} className="flex items-center justify-center text-xl text-slate-500 bg-slate-900/30 rounded-xl select-none">
                                {d.label}
                              </div>
                            );
                          }
                          const isSelected = formSafeWindDirections.includes(d.key);
                          return (
                            <button
                              key={d.key}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  setFormSafeWindDirections(formSafeWindDirections.filter(dir => dir !== d.key));
                                } else {
                                  setFormSafeWindDirections([...formSafeWindDirections, d.key]);
                                }
                              }}
                              className={`flex flex-col items-center justify-center rounded-xl border transition-all ${
                                isSelected
                                  ? "bg-amber-600 border-amber-500 text-white shadow-[0_0_10px_rgba(217,119,6,0.3)] scale-[1.03] font-black"
                                  : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-850 hover:text-slate-200 text-xs font-semibold"
                              }`}
                            >
                              <span className="text-[9px] text-slate-500 mb-0.5 font-light">{d.label}</span>
                              <span className="text-xs">{d.key}</span>
                            </button>
                          );
                        });
                      })()}
                    </div>
                  </div>
                </div>

                {/* Features */}
                <div className="flex flex-col gap-3 mt-2">
                  <label className="text-sm font-semibold text-slate-300">地形・設備タグ</label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input type="checkbox" checked={formHasSeaweed} onChange={e => setFormHasSeaweed(e.target.checked)} className="accent-amber-500 w-4 h-4 cursor-pointer" />
                      <span className="text-sm text-slate-400 group-hover:text-slate-200 transition-colors">🌿 藻場あり</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input type="checkbox" checked={formShallow} onChange={e => setFormShallow(e.target.checked)} className="accent-amber-500 w-4 h-4 cursor-pointer" />
                      <span className="text-sm text-slate-400 group-hover:text-slate-200 transition-colors">🌊 シャローエリア</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input type="checkbox" checked={formFeatures.includes("night_light")} onChange={e => {
                        if (e.target.checked) setFormFeatures([...formFeatures, "night_light"]);
                        else setFormFeatures(formFeatures.filter(f => f !== "night_light"));
                      }} className="accent-amber-500 w-4 h-4 cursor-pointer" />
                      <span className="text-sm text-slate-400 group-hover:text-slate-200 transition-colors">💡 常夜灯あり</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input type="checkbox" checked={formFeatures.includes("parking")} onChange={e => {
                        if (e.target.checked) setFormFeatures([...formFeatures, "parking"]);
                        else setFormFeatures(formFeatures.filter(f => f !== "parking"));
                      }} className="accent-amber-500 w-4 h-4 cursor-pointer" />
                      <span className="text-sm text-slate-400 group-hover:text-slate-200 transition-colors">🚗 駐車場あり</span>
                    </label>
                  </div>
                </div>

                {/* Memo */}
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-slate-300">メモ（備考・根掛かりや時合など）</label>
                  <textarea
                    value={formMemo}
                    onChange={(e) => setFormMemo(e.target.value)}
                    placeholder="例: 常夜灯の周りは浅い。満潮前後がチャンス。手前は根荒い。"
                    rows={3}
                    className="bg-slate-950 border border-slate-700 text-slate-100 p-2.5 rounded-md focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all resize-none text-sm placeholder:text-slate-650"
                  />
                </div>

              </CardContent>
              <CardFooter className="flex justify-end gap-3 pt-4 border-t border-slate-800 pb-6 pr-6 shrink-0">
                <button 
                  onClick={handleCancelSave}
                  className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-white transition-colors"
                >
                  キャンセル
                </button>
                <button 
                  onClick={handleSavePoint}
                  disabled={!formName}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-bold bg-amber-600 hover:bg-amber-500 text-white rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(217,119,6,0.4)]"
                >
                  <Save className="w-4 h-4" />
                  {editingPointId ? "変更を保存" : "マップに追加"}
                </button>
              </CardFooter>
            </Card>
          </div>
        )}

      {/* 潮汐詳細モーダル (Dialog) */}
      {showTideModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[350] flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <Card className="w-full max-w-xl bg-slate-900/95 backdrop-blur-xl border-slate-700/60 shadow-2xl rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 relative">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-600"></div>
            
            <CardHeader className="pb-3 pt-6 border-b border-slate-800/80 px-6">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <div className="text-[10px] font-black text-cyan-400 tracking-wider">TIDE GRAPH</div>
                  <CardTitle className="text-lg md:text-xl font-black text-slate-100 flex items-center gap-2">
                    <Droplets className="w-5 h-5 text-cyan-400 animate-pulse" />
                    潮汐詳細グラフ & 潮見表
                  </CardTitle>
                </div>
                <button 
                  onClick={() => setShowTideModal(false)} 
                  className="text-slate-400 hover:text-white transition-colors bg-slate-800 hover:bg-slate-700 p-1.5 rounded-lg border border-slate-700/60"
                >
                  <X className="w-5 h-5"/>
                </button>
              </div>
            </CardHeader>
            
            <CardContent className="pt-6 px-6 pb-6 flex flex-col gap-6">
              {/* 対象ポイント・潮回り概要 */}
              <div className="flex items-center justify-between bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                <div>
                  <div className="text-[10px] font-bold text-slate-500">対象エリア/ポイント</div>
                  <div className="text-base font-black text-white truncate max-w-[200px] md:max-w-[300px]">
                    {selectedPoint ? selectedPoint.name : "エリア全体 (平均)"}
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <div className="text-[10px] font-bold text-slate-500 mb-0.5">潮回り</div>
                  <span className="text-xs font-black bg-cyan-950 text-cyan-400 border border-cyan-700/50 px-3 py-1 rounded-lg shadow-[0_0_10px_rgba(6,182,212,0.1)]">
                    {tideData.tideType}
                  </span>
                </div>
              </div>

              {/* Tide Chart Display */}
              <div className="bg-slate-950/30 rounded-2xl p-4 border border-slate-800/60">
                <TideChart 
                  data={tideData.hourlyData} 
                  currentHour={currentHour} 
                  currentLevel={currentTideStatus.currentLevel} 
                />
              </div>

              {/* 満潮・干潮のタイムライン */}
              <div className="grid grid-cols-2 gap-4">
                {/* 満潮 */}
                <div className="flex flex-col gap-2.5 bg-slate-950/40 p-4 rounded-xl border border-slate-800">
                  <div className="text-xs font-black text-pink-400 flex items-center gap-1.5">
                    <ArrowUp className="w-3.5 h-3.5 animate-bounce" />
                    満潮 (High Tide)
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {tideData.highTides.map((event, idx) => (
                      <div key={idx} className="flex justify-between items-baseline text-sm">
                        <span className="font-mono text-slate-300 font-bold">{event.time}</span>
                        <span className="font-mono text-white font-black">{event.level} <span className="text-[10px] text-slate-500 font-normal">cm</span></span>
                      </div>
                    ))}
                    {tideData.highTides.length === 0 && <span className="text-xs text-slate-500">データなし</span>}
                  </div>
                </div>

                {/* 干潮 */}
                <div className="flex flex-col gap-2.5 bg-slate-950/40 p-4 rounded-xl border border-slate-800">
                  <div className="text-xs font-black text-cyan-400 flex items-center gap-1.5">
                    <ArrowUp className="w-3.5 h-3.5 transform rotate-180" />
                    干潮 (Low Tide)
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {tideData.lowTides.map((event, idx) => (
                      <div key={idx} className="flex justify-between items-baseline text-sm">
                        <span className="font-mono text-slate-300 font-bold">{event.time}</span>
                        <span className="font-mono text-white font-black">{event.level} <span className="text-[10px] text-slate-500 font-normal">cm</span></span>
                      </div>
                    ))}
                    {tideData.lowTides.length === 0 && <span className="text-xs text-slate-500">データなし</span>}
                  </div>
                </div>
              </div>

              {/* 現在の状況概要 */}
              <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-850 flex items-center justify-between text-sm">
                <span className="text-slate-400 font-bold">現在のステータス:</span>
                <div className="flex items-center gap-3">
                  <span className="font-black text-white text-base">{currentTideStatus.currentLevel} cm</span>
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-black ${
                    currentTideStatus.statusText === "上げ潮" 
                      ? "bg-emerald-950 text-emerald-300 border border-emerald-800/50 shadow-[0_0_10px_rgba(16,185,129,0.1)]" 
                      : currentTideStatus.statusText === "下げ潮"
                        ? "bg-blue-950 text-blue-300 border border-blue-800/50 shadow-[0_0_10px_rgba(59,130,246,0.1)]"
                        : "bg-slate-800 text-slate-200 border border-slate-700"
                  }`}>
                    {currentTideStatus.statusText}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      </main>

      {/* フローティングトースト通知 */}
      {toast && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[400] animate-in fade-in slide-in-from-top-3 duration-250 pointer-events-none">
          <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-md ${
            toast.type === "success" 
              ? "bg-emerald-950/90 border-emerald-500/50 text-emerald-300"
              : toast.type === "error"
                ? "bg-red-950/90 border-red-500/50 text-red-300"
                : "bg-slate-900/90 border-slate-700/50 text-slate-200"
          }`}>
            {toast.type === "success" && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
            {toast.type === "error" && <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />}
            {toast.type === "info" && <Info className="w-5 h-5 text-cyan-400 shrink-0" />}
            <span className="text-xs md:text-sm font-bold tracking-wide">{toast.message}</span>
          </div>
        </div>
      )}

      {/* Google GIS Script */}
      <Script 
        src="https://accounts.google.com/gsi/client" 
        strategy="afterInteractive"
        onLoad={() => console.log("Google Identity Services loaded")}
      />
    </div>
  )
}
