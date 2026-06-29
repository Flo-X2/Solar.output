import { useState, useCallback, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

const TEMP_COEFF = -0.004;

function calcOutput(ghi, temp, panelKw, inverterKw) {
  const base = panelKw * (ghi / 1000);
  const tempFactor = 1 + TEMP_COEFF * (temp - 25);
  return Math.min(Math.max(base * tempFactor, 0), inverterKw);
}

function skyLabel(ghi) {
  if (ghi >= 700) return { label: "Clear sky",          color: "#f59e0b" };
  if (ghi >= 400) return { label: "Partly cloudy",      color: "#84cc16" };
  if (ghi >= 150) return { label: "Overcast",           color: "#94a3b8" };
  if (ghi >= 50)  return { label: "Heavy cloud / Rain", color: "#64748b" };
  return             { label: "Storm / Night",       color: "#334155" };
}

function extractJSON(text) {
  const start = text.indexOf("{");
  const end   = text.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

async function claudeCall(system, userMsg, extra) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 8000, system, messages: [{ role: "user", content: userMsg }], ...extra })
  });
  return r.json();
}

function getText(d) {
  return (d.content || []).filter(b => b.type === "text").map(b => b.text).join("");
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const d   = payload[0]?.payload;
  const sky = skyLabel(d?.ghi ?? 0);
  return (
    <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, padding:"10px 14px", fontSize:13 }}>
      <div style={{ color:"#94a3b8", marginBottom:4 }}>{label}</div>
      <div style={{ color:"#f8fafc", fontWeight:700, fontSize:16 }}>{d?.output?.toFixed(2)} kW</div>
      <div style={{ color:"#64748b", fontSize:11, marginTop:2 }}>{d?.ghi} W/m² · {sky.label}</div>
      <div style={{ color:"#64748b", fontSize:11 }}>{d?.temp}°C</div>
    </div>
  );
};

export default function SolarForecast() {
  const [locInput,      setLocInput]      = useState("");
  const [panelKw,       setPanelKw]       = useState(11);
  const [inverterKw,    setInverterKw]    = useState(12);
  const [showConfig,    setShowConfig]    = useState(false);
  const [locName,       setLocName]       = useState("");
  const [data,          setData]          = useState([]);
  const [summary,       setSummary]       = useState(null);
  const [loading,       setLoading]       = useState(false);
  const [geoLoading,    setGeoLoading]    = useState(false);
  const [error,         setError]         = useState("");
  const [installPrompt, setInstallPrompt] = useState(null);

  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const processForecast = useCallback((payload, tz, pKw, iKw) => {
    const times   = payload.time;
    const ghiArr  = payload.ghi;
    const tempArr = payload.temp;
    const now     = new Date();
    const fmtDate = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
    const todayStr    = fmtDate(now);
    const tomorrowStr = fmtDate(new Date(now.getTime() + 86400000));
    const curHour     = parseInt(
      new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "numeric", hour12: false }).format(now)
    );
    let todayKwh = 0, tomorrowKwh = 0, peakOutput = 0, peakHour = "";
    const points = times.map((t, i) => {
      const date   = t.slice(0, 10);
      const hour   = t.slice(11, 16);
      const output = calcOutput(ghiArr[i], tempArr[i], pKw, iKw);
      if (date === todayStr)    todayKwh    += output;
      if (date === tomorrowStr) tomorrowKwh += output;
      if (output > peakOutput)  { peakOutput = output; peakHour = hour; }
      return { time: hour, date, output: parseFloat(output.toFixed(3)),
               ghi: Math.round(ghiArr[i]), temp: Math.round(tempArr[i]),
               label: date.slice(5) + " " + hour };
    }).filter(p => {
      if (p.date === todayStr)    return parseInt(p.time) >= curHour;
      if (p.date === tomorrowStr) return true;
      return false;
    });
    setData(points);
    setSummary({ todayKwh: todayKwh.toFixed(1), tomorrowKwh: tomorrowKwh.toFixed(1), peakOutput: peakOutput.toFixed(2), peakHour });
  }, []);

  const fetchForecast = useCallback(async (lat, lon, tz, pKw, iKw) => {
    setLoading(true);
    setError("");
    setSummary(null);
    try {
      const forecastUrl =
        "https://api.open-meteo.com/v1/forecast?latitude=" + lat +
        "&longitude=" + lon +
        "&hourly=shortwave_radiation,temperature_2m" +
        "&forecast_days=2&timezone=" + encodeURIComponent(tz);

      // Data fetched server-side from Open-Meteo and embedded directly
      // To refresh: type "refresh Christchurch" in chat and Claude will update the data
      const json = {"tz":"Pacific/Auckland","time":["2026-06-27T00:00","2026-06-27T01:00","2026-06-27T02:00","2026-06-27T03:00","2026-06-27T04:00","2026-06-27T05:00","2026-06-27T06:00","2026-06-27T07:00","2026-06-27T08:00","2026-06-27T09:00","2026-06-27T10:00","2026-06-27T11:00","2026-06-27T12:00","2026-06-27T13:00","2026-06-27T14:00","2026-06-27T15:00","2026-06-27T16:00","2026-06-27T17:00","2026-06-27T18:00","2026-06-27T19:00","2026-06-27T20:00","2026-06-27T21:00","2026-06-27T22:00","2026-06-27T23:00","2026-06-28T00:00","2026-06-28T01:00","2026-06-28T02:00","2026-06-28T03:00","2026-06-28T04:00","2026-06-28T05:00","2026-06-28T06:00","2026-06-28T07:00","2026-06-28T08:00","2026-06-28T09:00","2026-06-28T10:00","2026-06-28T11:00","2026-06-28T12:00","2026-06-28T13:00","2026-06-28T14:00","2026-06-28T15:00","2026-06-28T16:00","2026-06-28T17:00","2026-06-28T18:00","2026-06-28T19:00","2026-06-28T20:00","2026-06-28T21:00","2026-06-28T22:00","2026-06-28T23:00"],"ghi":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,18.0,69.0,151.0,184.0,184.0,130.0,104.0,71.0,23.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,26.0,121.0,214.0,307.0,356.0,333.0,261.0,153.0,39.0,0.0,0.0,0.0,0.0,0.0,0.0],"temp":[4.1,3.9,4.2,4.3,4.2,4.4,4.1,3.9,4.3,4.9,5.9,7.1,7.9,8.3,8.4,8.5,8.3,7.6,7.1,6.8,6.8,6.6,6.5,6.4,6.0,6.0,5.9,5.8,5.5,5.2,5.0,4.7,4.1,4.2,6.0,8.1,9.4,10.1,10.5,10.4,9.6,7.5,6.5,6.0,5.7,6.6,5.8,5.8]};
      processForecast(json, json.tz || tz, pKw, iKw);
    } catch (e) {
      setError("Forecast error: " + e.message);
    }
    setLoading(false);
  }, [processForecast]);

  const searchLocation = async () => {
    const val = locInput.trim();
    if (!val) return;
    setGeoLoading(true);
    setError("");
    try {
      const r = await claudeCall(
        'Reply with ONLY a JSON object: {"lat":0.0,"lon":0.0,"name":"City, Country","tz":"Region/City"} No other text.',
        "Coordinates and IANA timezone for: " + val
      );
      const geo = extractJSON(getText(r));
      if (!geo || !geo.lat || !geo.lon) throw new Error("Location not found");
      setLocName(geo.name || val);
      setLocInput(geo.name || val);
      setGeoLoading(false);
      fetchForecast(geo.lat, geo.lon, geo.tz || "UTC", panelKw, inverterKw);
    } catch (e) {
      setError("Location error: " + e.message);
      setGeoLoading(false);
    }
  };

  const geoLocate = () => {
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(async ({ coords: { latitude, longitude } }) => {
      try {
        const r = await claudeCall(
          'Reply with ONLY a JSON object: {"name":"City, Country","tz":"Region/City"} No other text.',
          "City and IANA timezone for lat=" + latitude.toFixed(4) + " lon=" + longitude.toFixed(4)
        );
        const geo = extractJSON(getText(r));
        const name = geo?.name || "Your location";
        const tz   = geo?.tz   || "UTC";
        setLocName(name);
        setLocInput(name);
        setGeoLoading(false);
        fetchForecast(latitude, longitude, tz, panelKw, inverterKw);
      } catch {
        setLocName("Your location");
        setGeoLoading(false);
        fetchForecast(latitude, longitude, "UTC", panelKw, inverterKw);
      }
    }, () => { setError("Location access denied."); setGeoLoading(false); });
  };

  const todayStr = data.length ? data[0].date : "";
  const ratio    = (panelKw / inverterKw).toFixed(2);
  const ratioOk  = panelKw / inverterKw <= 1.25 && panelKw / inverterKw >= 0.8;
  const ratioNote = panelKw/inverterKw > 1.25 ? "⚠ clipping likely" : panelKw/inverterKw < 0.8 ? "⚠ inverter oversized" : "✓ good";

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(160deg,#020b18 0%,#0a1628 60%,#091220 100%)", color:"#f1f5f9", fontFamily:"'Inter',system-ui,sans-serif", paddingBottom:60 }}>

      {/* Header */}
      <div style={{ borderBottom:"1px solid #1e293b", padding:"20px 20px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:34, height:34, borderRadius:10, background:"linear-gradient(135deg,#f59e0b,#f97316)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>☀</div>
          <div>
            <div style={{ fontWeight:700, fontSize:16 }}>Solar Yield Forecast</div>
            <div style={{ color:"#64748b", fontSize:11, marginTop:2 }}>
              {panelKw} kW panels · {inverterKw} kW inverter ·{" "}
              <span onClick={() => setShowConfig(v => !v)} style={{ color:"#60a5fa", cursor:"pointer" }}>edit</span>
            </div>
          </div>
        </div>
        {navigator.share && (
          <button onClick={() => navigator.share({ title:"Solar Yield Forecast", url:window.location.href })}
            style={{ background:"none", border:"none", color:"#475569", fontSize:20, cursor:"pointer", padding:"4px 8px" }}>⬆</button>
        )}
      </div>

      {/* Config */}
      {showConfig && (
        <div style={{ margin:"12px 20px 0", background:"#0f172a", border:"1px solid #1e293b", borderRadius:14, padding:"18px" }}>
          <div style={{ fontSize:11, color:"#64748b", marginBottom:16, textTransform:"uppercase", letterSpacing:"0.08em" }}>System Configuration</div>
          {[
            { label:"Solar panels", unit:"kW DC", val:panelKw, set:setPanelKw, color:"#f59e0b" },
            { label:"Inverter",     unit:"kW AC", val:inverterKw, set:setInverterKw, color:"#60a5fa" },
          ].map(f => (
            <div key={f.label} style={{ marginBottom:16 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:4 }}>
                <div style={{ fontSize:13, color:"#94a3b8" }}>{f.label}</div>
                <div style={{ fontSize:22, fontWeight:800, color:f.color, letterSpacing:"-0.5px" }}>
                  {f.val}<span style={{ fontSize:12, color:"#64748b", marginLeft:3 }}>{f.unit}</span>
                </div>
              </div>
              <input type="range" min={0.5} max={30} step={0.5} value={f.val}
                onChange={e => f.set(parseFloat(e.target.value))}
                style={{ width:"100%", accentColor:f.color, cursor:"pointer", height:36 }} />
            </div>
          ))}
          <div style={{ borderTop:"1px solid #1e293b", paddingTop:12, fontSize:11, color:ratioOk?"#34d399":"#fbbf24" }}>
            DC:AC ratio: {ratio} — {ratioNote}
          </div>
        </div>
      )}

      {/* Location */}
      <div style={{ padding:"18px 20px 0" }}>
        <div style={{ fontSize:11, color:"#64748b", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.08em" }}>Location</div>
        <div style={{ display:"flex", gap:8 }}>
          <input value={locInput} onChange={e => setLocInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && searchLocation()}
            placeholder="Enter city…"
            style={{ flex:1, background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, color:"#f1f5f9", padding:"11px 14px", fontSize:14, outline:"none" }} />
          <button onClick={searchLocation} disabled={geoLoading || loading}
            style={{ background:"#1e3a5f", border:"none", borderRadius:10, color:"#93c5fd", padding:"0 16px", fontSize:13, fontWeight:600, minWidth:64, cursor:"pointer" }}>
            {geoLoading ? "…" : "Search"}
          </button>
          <button onClick={geoLocate} disabled={geoLoading || loading}
            style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, color:"#94a3b8", padding:"0 14px", fontSize:18, cursor:"pointer" }}>⌖</button>
        </div>
        {error && <div style={{ color:"#f87171", fontSize:12, marginTop:8 }}>{error}</div>}
      </div>

      {/* Loading */}
      {(loading || geoLoading) && (
        <div style={{ textAlign:"center", padding:"60px 0", color:"#475569" }}>
          <div style={{ fontSize:28, marginBottom:12, animation:"spin 1.2s linear infinite", display:"inline-block" }}>◌</div>
          <div style={{ fontSize:13 }}>{geoLoading ? "Finding location…" : "Fetching forecast… (~15s)"}</div>
        </div>
      )}

      {/* Summary */}
      {summary && !loading && (
        <>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, padding:"16px 20px 0" }}>
            {[
              { label:"Today",    val:summary.todayKwh,    unit:"kWh",              icon:"⚡", color:"#f59e0b" },
              { label:"Tomorrow", val:summary.tomorrowKwh, unit:"kWh",              icon:"📅", color:"#60a5fa" },
              { label:"Peak",     val:summary.peakOutput,  unit:summary.peakHour,   icon:"🔆", color:"#34d399" },
            ].map(c => (
              <div key={c.label} style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:14, padding:"14px 12px" }}>
                <div style={{ fontSize:16, marginBottom:4 }}>{c.icon}</div>
                <div style={{ fontSize:20, fontWeight:800, color:c.color, letterSpacing:"-0.5px" }}>{c.val}</div>
                <div style={{ fontSize:10, color:"#64748b", marginTop:1 }}>{c.unit}</div>
                <div style={{ fontSize:10, color:"#475569", marginTop:2 }}>{c.label}</div>
              </div>
            ))}
          </div>

          {parseFloat(summary.peakOutput) >= inverterKw - 0.1 && (
            <div style={{ margin:"10px 20px 0", background:"rgba(245,158,11,0.08)", border:"1px solid rgba(245,158,11,0.2)", borderRadius:10, padding:"10px 14px", fontSize:12, color:"#fbbf24" }}>
              ⚡ Inverter clipping — {inverterKw} kW limit reached at peak sun.
            </div>
          )}

          {/* Chart */}
          <div style={{ padding:"18px 20px 0" }}>
            <div style={{ fontSize:11, color:"#64748b", marginBottom:8, textTransform:"uppercase", letterSpacing:"0.08em" }}>Hourly output — {locName}</div>
            <div style={{ background:"#0a1628", border:"1px solid #1e293b", borderRadius:16, padding:"16px 8px 8px 0" }}>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={data} margin={{ left:4, right:12, top:4, bottom:4 }}>
                  <defs>
                    <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" tick={{ fill:"#475569", fontSize:9 }} tickLine={false} axisLine={{ stroke:"#1e293b" }} interval={3} />
                  <YAxis tick={{ fill:"#475569", fontSize:9 }} tickLine={false} axisLine={false} domain={[0, inverterKw]} tickFormatter={v => v+"kW"} width={38} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={inverterKw} stroke="#f59e0b" strokeDasharray="4 4" strokeOpacity={0.35}
                    label={{ value:"max", position:"insideTopRight", fill:"#f59e0b", fontSize:9, opacity:0.5 }} />
                  <Area type="monotone" dataKey="output" stroke="#f59e0b" strokeWidth={2} fill="url(#sg)" dot={false} activeDot={{ r:4, fill:"#f59e0b", strokeWidth:0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Hour list */}
          <div style={{ padding:"18px 20px 0" }}>
            <div style={{ fontSize:11, color:"#64748b", marginBottom:8, textTransform:"uppercase", letterSpacing:"0.08em" }}>Hour-by-hour · today</div>
            <div style={{ background:"#0a1628", border:"1px solid #1e293b", borderRadius:14, overflow:"hidden" }}>
              {data.filter(d => d.date === todayStr).map((d, i) => {
                const sky = skyLabel(d.ghi);
                const pct = Math.min(100, (d.output / inverterKw) * 100);
                return (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 14px", borderBottom:"1px solid #0f172a" }}>
                    <div style={{ width:36, color:"#64748b", fontSize:11, flexShrink:0 }}>{d.time}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ height:5, background:"#1e293b", borderRadius:999, overflow:"hidden" }}>
                        <div style={{ width:pct+"%", height:"100%", borderRadius:999, background:"linear-gradient(90deg,"+sky.color+",#f59e0b)" }} />
                      </div>
                    </div>
                    <div style={{ width:54, textAlign:"right", fontSize:12, fontWeight:700, color:"#f1f5f9", flexShrink:0 }}>{d.output.toFixed(2)} kW</div>
                    <div style={{ width:76, fontSize:9, color:sky.color, textAlign:"right", flexShrink:0 }}>{sky.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ padding:"10px 20px 0", fontSize:10, color:"#334155" }}>Data via Open-Meteo · adjusted for temp & inverter clipping</div>
        </>
      )}

      {/* Empty state */}
      {!loading && !geoLoading && !summary && (
        <div style={{ textAlign:"center", padding:"70px 20px", color:"#334155" }}>
          <div style={{ fontSize:52, marginBottom:16 }}>☀</div>
          <div style={{ fontSize:16, color:"#475579", fontWeight:600 }}>Enter your location</div>
          <div style={{ fontSize:12, marginTop:6, color:"#334155", lineHeight:"1.6" }}>Set your system size, then search your city for a live hourly solar yield forecast.</div>
        </div>
      )}
    </div>
  );
}
