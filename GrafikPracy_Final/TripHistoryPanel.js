import React, {useEffect, useState} from 'react';
import {Modal, Platform, ScrollView, Text, TouchableOpacity, View} from 'react-native';
import {WebView} from 'react-native-webview';
import {apiGetGpsTrips, apiGetGpsTrip} from './apiClient';

const MAPTILER_KEY = process.env.EXPO_PUBLIC_MAPTILER_KEY || '';

const timestampMillis = value => { if (typeof value === 'number' && Number.isFinite(value)) return value; if (value && typeof value.toMillis === 'function') return value.toMillis(); if (typeof value === 'string' && value.trim()) { const n=Number(value); if(Number.isFinite(n)) return n; const parsed=Date.parse(value); return Number.isFinite(parsed)?parsed:0; } return 0; };
const coordinateIsValid = value => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value));
const distanceMeters = (a,b) => { if(!a||!b)return Infinity; const R=6371000,p1=Number(a.latitude)*Math.PI/180,p2=Number(b.latitude)*Math.PI/180,dLat=(Number(b.latitude)-Number(a.latitude))*Math.PI/180,dLon=(Number(b.longitude)-Number(a.longitude))*Math.PI/180,h=Math.sin(dLat/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dLon/2)**2; return 2*R*Math.asin(Math.sqrt(Math.max(0,Math.min(1,h)))); };
const cleanGpsPoints = (points=[]) => { const valid=(Array.isArray(points)?points:[]).filter(p=>coordinateIsValid(p?.latitude)&&coordinateIsValid(p?.longitude)&&Math.abs(Number(p.latitude))<=90&&Math.abs(Number(p.longitude))<=180&&timestampMillis(p?.observedAt??p?.updatedAt)>0&&(p?.accuracy==null||!Number.isFinite(Number(p.accuracy))||Number(p.accuracy)<=100)).map(p=>({...p,latitude:Number(p.latitude),longitude:Number(p.longitude),_time:timestampMillis(p.observedAt??p.updatedAt)})).sort((a,b)=>a._time-b._time); const out=[]; for(const point of valid){const prev=out[out.length-1];if(prev){const dt=point._time-prev._time,dist=distanceMeters(prev,point);if(dt<=0)continue;if(dist<8&&dt<5000)continue;if(dist>200&&dt<5000)continue;}out.push(point);} return out.map(({_time,...point})=>point); };
const smoothRoute = (points=[]) => { if(points.length<3)return points; return points.map((point,index)=>{if(index===0||index===points.length-1)return point;const prev=points[index-1],next=points[index+1];const tPrev=timestampMillis(prev.observedAt??prev.updatedAt),t=timestampMillis(point.observedAt??point.updatedAt),tNext=timestampMillis(next.observedAt??next.updatedAt);if(t<=tPrev||tNext<=t||t-tPrev>15*60*1000||tNext-t>15*60*1000||distanceMeters(prev,point)>120||distanceMeters(point,next)>120)return point;return {...point,latitude:(prev.latitude+point.latitude+next.latitude)/3,longitude:(prev.longitude+point.longitude+next.longitude)/3};}); };


const paletteTripColor = id => ['#2d7cff','#f97316','#a855f7','#14b8a6','#eab308','#ec4899','#22c55e','#ef4444'][[...String(id)].reduce((sum,ch)=>sum+ch.charCodeAt(0),0)%8];
const fmtDuration = seconds => {
  const s = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? h + ' godz. ' + m + ' min' : m + ' min';
};
const tripMapHtml = (points, routeId = '', matchedSegments = []) => {
  const data = JSON.stringify(smoothRoute(cleanGpsPoints(points))).replace(/</g, '\\u003c');
  const palette = ['#2d7cff','#f97316','#a855f7','#14b8a6','#eab308','#ec4899','#22c55e','#ef4444'];
  const routeColor = palette[[...String(routeId)].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % palette.length];
  const tileUrl = MAPTILER_KEY ? 'https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=' + MAPTILER_KEY : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  return '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><style>html,body,#map{height:100%;width:100%;margin:0;background:#101722}.leaflet-container{height:100%;width:100%;background:#101722}</style></head><body><div id="map"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>const points=' + data + ';const routeColor=' + JSON.stringify(routeColor) + ';const matched=' + JSON.stringify(matchedSegments || []) + ';const map=L.map("map").setView([51,16.8],7);let activeTileUrl=' + JSON.stringify(tileUrl) + ';let fallbackTiles=false;let tiles=L.tileLayer(activeTileUrl,{maxZoom:19,attribution:"© OpenStreetMap contributors"}).addTo(map);tiles.on("tileerror",function(){if(!fallbackTiles&&activeTileUrl.indexOf("api.maptiler.com")>=0){fallbackTiles=true;map.removeLayer(tiles);activeTileUrl="https://tile.openstreetmap.org/{z}/{x}/{y}.png";tiles=L.tileLayer(activeTileUrl,{maxZoom:19,attribution:"© OpenStreetMap contributors"}).addTo(map);}});const coords=points.map(p=>[+p.latitude,+p.longitude]);if(coords.length){const segments=[];let segment=[],previous=null;const meters=(a,b)=>{const rad=v=>v*Math.PI/180,dl=rad(b[1]-a[1]),dp=rad(b[0]-a[0]),h=Math.sin(dp/2)**2+Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(dl/2)**2;return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));};points.forEach((p,i)=>{const coord=coords[i],time=Date.parse(p.observedAt);if(previous){const dt=time-previous.time;if(dt<=0||dt>15*60*1000||meters(previous.coord,coord)>5000){if(segment.length>1)segments.push(segment);segment=[];} }if(!segment.length)segment.push(coord);else segment.push(coord);previous={coord,time};});if(segment.length>1)segments.push(segment);const drawSegments=matched.length?matched:segments;drawSegments.forEach(line=>L.polyline(line,{color:routeColor,weight:5,opacity:.95}).addTo(map));points.forEach(p=>L.circleMarker([p.latitude,p.longitude],{radius:5,color:"#fff",weight:2,fillColor:routeColor,fillOpacity:1}).bindPopup((p.speedKmh==null?"Brak prędkości":Math.round(p.speedKmh)+" km/h")+"<br>"+new Date(p.observedAt).toLocaleString("pl-PL")).on("click",function(){if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify({type:"gpsPoint",point:p}));}}).addTo(map));L.circleMarker(coords[0],{radius:7,color:"#fff",fillColor:"#22c55e",fillOpacity:1}).bindPopup("START").addTo(map);L.circleMarker(coords[coords.length-1],{radius:7,color:"#fff",fillColor:"#ef4444",fillOpacity:1}).addTo(map);if(coords.length>1){map.fitBounds(coords,{padding:[18,18]});}}const fitRoute=()=>{map.invalidateSize(true);if(coords.length>1)map.fitBounds(coords,{padding:[18,18],animate:false});};window.addEventListener("load",()=>setTimeout(fitRoute,150));window.addEventListener("resize",()=>setTimeout(fitRoute,100));setTimeout(fitRoute,250);setTimeout(fitRoute,900);</script></body></html>';
};

export default function TripHistoryPanel({vehicleId}) {
  const [trips, setTrips] = useState([]);
  const [selected, setSelected] = useState(null);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [matchedSegments, setMatchedSegments] = useState([]);
  const [matchingStatus, setMatchingStatus] = useState('');
  useEffect(() => {
    let active = true;
    let inFlight = false;
    const loadTrips = async (manual = false) => {
      if (!vehicleId || inFlight) return;
      inFlight = true;
      if (manual && active) setRefreshing(true);
      try {
        const rows = await apiGetGpsTrips(vehicleId);
        if (active) { setTrips(rows || []); setError(''); }
      } catch (e) {
        if (active) setError(String(e?.message || 'Nie udało się pobrać historii tras'));
      } finally {
        inFlight = false;
        if (manual && active) setRefreshing(false);
      }
    };
    if (!vehicleId) { setTrips([]); return () => { active = false; }; }
    loadTrips();
    const timer = setInterval(() => loadTrips(), 30000);
    return () => { active = false; clearInterval(timer); };
  }, [vehicleId]);
  const refreshTrips = async () => {
    if (refreshing || !vehicleId) return;
    setRefreshing(true);
    try { const rows = await apiGetGpsTrips(vehicleId); setTrips(rows || []); setError(''); }
    catch (e) { setError(String(e?.message || 'Nie udało się odświeżyć historii tras')); }
    finally { setRefreshing(false); }
  };
  const openTrip = async trip => {
    try {
      setLoading(true); setError(''); setMatchedSegments([]); setMatchingStatus('Ślad pokazuje zapisane punkty GPS, bez zewnętrznego routingu.');
      const detail = await apiGetGpsTrip(vehicleId, trip.id); setSelected(detail && typeof detail === 'object' ? {...detail, points:Array.isArray(detail.points)?detail.points:[]} : {...trip, points:[]});
    } catch (e) { setError(String(e?.message || 'Nie udało się otworzyć trasy')); }
    finally { setLoading(false); }
  };
  const card = {backgroundColor:'#141922',borderRadius:18,padding:14,marginBottom:10,borderWidth:1,borderColor:'#303a4a'};
  const title = {color:'#fff',fontSize:16,fontWeight:'900',marginBottom:7};
  const sub = {color:'#aeb8c8',fontSize:12,marginTop:4};
  const row = {paddingVertical:10,borderBottomWidth:1,borderBottomColor:'#303a4a'};
  const button = {backgroundColor:'#303a4a',borderRadius:10,padding:11,alignItems:'center',marginTop:10};
  const buttonText = {color:'#fff',fontWeight:'800'};
  return <View style={card}>
    <Text style={title}>🛣️ HISTORIA PRZEJAZDÓW · 7 DNI</Text>
    <Text style={sub}>Każdy przejazd ma osobną mapę i statystyki. Historia odświeża się automatycznie co 30 s.</Text>
    <TouchableOpacity style={button} onPress={refreshTrips} disabled={refreshing}>
      <Text style={buttonText}>{refreshing ? 'ODŚWIEŻANIE…' : 'ODŚWIEŻ HISTORIĘ'}</Text>
    </TouchableOpacity>
    {error ? <Text style={[sub,{color:'#f0b35a'}]}>{error}</Text> : null}
    {trips.length ? trips.map(trip => <TouchableOpacity key={trip.id} style={[row,{borderLeftWidth:4,borderLeftColor:paletteTripColor(trip.id),paddingLeft:10}]} disabled={loading} onPress={() => openTrip(trip)}>
      <Text style={{color:'#fff',fontWeight:'800'}}>{new Date(trip.startedAt).toLocaleDateString('pl-PL')} · {new Date(trip.startedAt).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'})} do {new Date(trip.endedAt).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'})}</Text>
      <Text style={{color:'#fff',fontSize:17,fontWeight:'900',marginTop:5}}>{Number(trip.distanceKm).toFixed(2)} km · {fmtDuration(trip.durationSeconds)}</Text>
      <Text style={sub}>Śr. {trip.averageSpeedKmh} km/h · maks. {trip.maxSpeedKmh} km/h · {trip.pointCount} punktów GPS ›</Text>
    </TouchableOpacity>) : <Text style={sub}>Brak zarejestrowanych przejazdów z ostatnich 7 dni.</Text>}
    <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
      <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.78)',justifyContent:'center',padding:12}}>
        <View style={{backgroundColor:'#141922',borderRadius:18,padding:14,maxHeight:'94%',borderWidth:1,borderColor:'#303a4a'}}>
          <ScrollView>
            <Text style={title}>📍 SZCZEGÓŁY PRZEJAZDU</Text>
            {selected ? <>
              <Text style={sub}>{new Date(selected.startedAt).toLocaleString('pl-PL')} do {new Date(selected.endedAt).toLocaleString('pl-PL')}</Text>
              <Text style={sub}>Dystans: {selected.distanceKm} km · czas całkowity: {fmtDuration(selected.durationSeconds)}</Text>
              <Text style={sub}>{matchingStatus || 'Mapa przejazdu'}</Text>
              {cleanGpsPoints(selected.points).length < 2 ? <Text style={[sub,{color:'#f0b35a'}]}>Brak poprawnych punktów GPS dla tego przejazdu. Szczegóły przejazdu są dostępne, ale nie ma śladu do narysowania.</Text> : null}
              <Text style={sub}>Czas jazdy: {fmtDuration(selected.drivingSeconds)} · postoje: {selected.stops?.length || 0}</Text>
              <Text style={sub}>Średnia podczas jazdy: {selected.averageSpeedKmh} km/h</Text>
              <Text style={sub}>Średnia z postojami: {selected.averageIncludingStopsKmh} km/h · maksymalna: {selected.maxSpeedKmh} km/h</Text>
              <View style={{height:260,marginTop:12,borderRadius:12,overflow:'hidden',backgroundColor:'#101722'}}>
                {Platform.OS === 'web' ? <iframe title="Mapa wybranego przejazdu" srcDoc={tripMapHtml(selected.points, selected.id, matchedSegments)} style={{width:'100%',height:'100%',border:0}} /> : <WebView key={selected.id} originWhitelist={['*']} source={{html:tripMapHtml(selected.points, selected.id, matchedSegments)}} javaScriptEnabled domStorageEnabled androidLayerType="software" onMessage={event => { try { const message = JSON.parse(event.nativeEvent.data); if (message?.type === "gpsPoint" && message.point) setSelectedPoint(message.point); } catch {} }} style={{flex:1}} />}
              </View>
              <Text style={[title,{marginTop:14}]}>PUNKTY GPS</Text>
              {(selected.points || []).map(point => <TouchableOpacity key={point.id} style={row} onPress={() => setSelectedPoint(point)}>
                <Text style={{color:'#fff',fontWeight:'800'}}>{new Date(point.observedAt).toLocaleString('pl-PL')} · {point.speedKmh == null ? 'brak prędkości' : Math.round(point.speedKmh) + ' km/h'}</Text>
                <Text style={sub}>±{Math.round(point.accuracy || 0)} m · {Number(point.latitude).toFixed(5)}, {Number(point.longitude).toFixed(5)} · szczegóły ›</Text>
              </TouchableOpacity>)}
            </> : null}
          </ScrollView>
          <TouchableOpacity style={button} onPress={() => setSelected(null)}><Text style={buttonText}>ZAMKNIJ PRZEJAZD</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
    <Modal visible={!!selectedPoint} transparent animationType="fade" onRequestClose={() => setSelectedPoint(null)}>
      <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.78)',justifyContent:'center',padding:20}}>
        <View style={{backgroundColor:'#141922',borderRadius:16,padding:16}}>
          <Text style={title}>KONKRETNY POMIAR GPS</Text>
          {selectedPoint ? <>
            <Text style={sub}>Godzina: {new Date(selectedPoint.observedAt).toLocaleString('pl-PL')}</Text>
            <Text style={{color:'#fff',fontSize:24,fontWeight:'900',marginTop:8}}>{selectedPoint.speedKmh == null ? 'Brak pomiaru prędkości' : Math.round(selectedPoint.speedKmh) + ' km/h'}</Text>
            <Text style={sub}>Dokładność GPS: ±{Math.round(selectedPoint.accuracy || 0)} m</Text>
            <Text style={sub}>Współrzędne: {Number(selectedPoint.latitude).toFixed(6)}, {Number(selectedPoint.longitude).toFixed(6)}</Text>
          </> : null}
          <TouchableOpacity style={button} onPress={() => setSelectedPoint(null)}><Text style={buttonText}>WRÓĆ DO PRZEJAZDU</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  </View>;
}
