import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ActivityIndicator,AppState,Linking,Platform,SafeAreaView,ScrollView,Text,TextInput,TouchableOpacity,View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {WebView} from 'react-native-webview';
import {apiLogin,apiLogout,apiMe,apiGetGps,apiGetMyGps} from './apiClient';
import {getLocationDeviceToken,setLocationDeviceToken,getVehicleLocationConfig,getLocationDiagnostics,startVehicleLocationTracking,stopVehicleLocationTracking,ensureVehicleLocationTracking} from './LocationService';
import TripHistoryPanel from './TripHistoryPanel';

const USER_CACHE_KEY='3gf-cached-user-v1';
const MAPTILER_KEY=String(process.env.EXPO_PUBLIC_MAPTILER_KEY||'').trim();
const TILE_URL=MAPTILER_KEY
  ? 'https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key='+MAPTILER_KEY
  : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const MAP_HTML='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><style>html,body,#map{height:100%;width:100%;margin:0;background:#101722}.leaflet-control-attribution{font-size:9px}</style></head><body><div id="map"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>const map=L.map("map",{zoomControl:true}).setView([51.0,16.8],7);L.tileLayer('+JSON.stringify(TILE_URL)+',{maxZoom:19,attribution:"© OpenStreetMap contributors"}).addTo(map);let marker=null;window.setVehiclePoint=function(lat,lon){lat=Number(lat);lon=Number(lon);if(!Number.isFinite(lat)||!Number.isFinite(lon))return;if(!marker){marker=L.marker([lat,lon]).addTo(map);}else marker.setLatLng([lat,lon]);map.setView([lat,lon],Math.max(map.getZoom(),14));};setTimeout(()=>map.invalidateSize(true),250);</script></body></html>';

const styles={
  root:{flex:1,backgroundColor:'#0b0f16'},
  page:{padding:14,paddingBottom:40},
  header:{backgroundColor:'#151c27',borderWidth:1,borderColor:'#293446',borderRadius:18,padding:16,marginBottom:12},
  brand:{color:'#fff',fontSize:25,fontWeight:'900',letterSpacing:1},
  subtitle:{color:'#9aa8bb',fontSize:13,marginTop:4},
  card:{backgroundColor:'#151c27',borderWidth:1,borderColor:'#293446',borderRadius:16,padding:14,marginBottom:12},
  title:{color:'#fff',fontSize:17,fontWeight:'900',marginBottom:8},
  text:{color:'#d8e0eb',fontSize:14,lineHeight:20},
  muted:{color:'#91a0b4',fontSize:12,lineHeight:18,marginTop:5},
  input:{backgroundColor:'#0d131d',borderWidth:1,borderColor:'#344258',borderRadius:11,padding:12,color:'#fff',fontSize:15,marginTop:8},
  button:{backgroundColor:'#3478f6',borderRadius:12,padding:13,alignItems:'center',justifyContent:'center',marginTop:9,minHeight:46},
  secondary:{backgroundColor:'#293548'},
  danger:{backgroundColor:'#8b3440'},
  buttonText:{color:'#fff',fontWeight:'900',fontSize:13},
  row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
  map:{height:280,width:'100%',overflow:'hidden',borderRadius:13,backgroundColor:'#0d131d',marginTop:8},
  pill:{paddingVertical:7,paddingHorizontal:10,borderRadius:10,backgroundColor:'#243247',marginRight:7,marginBottom:7},
  selected:{backgroundColor:'#3478f6'},
  error:{color:'#ff9a9a',fontSize:13,marginTop:8},
  good:{color:'#65d6a0',fontWeight:'800'},
  warning:{color:'#ffc46b',fontWeight:'800'}
};

export default function TelematicsApp(){
  const [user,setUser]=useState(null);
  const [booting,setBooting]=useState(true);
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [deviceToken,setDeviceToken]=useState('');
  const [tokenSaved,setTokenSaved]=useState(false);
  const [vehicles,setVehicles]=useState([]);
  const [selectedVehicleId,setSelectedVehicleId]=useState('');
  const [initialTripId,setInitialTripId]=useState('');
  const [initialTripVehicleId,setInitialTripVehicleId]=useState('');
  const [config,setConfig]=useState({});
  const [diagnostics,setDiagnostics]=useState({});
  const [loading,setLoading]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [sessionRetry,setSessionRetry]=useState(false);
  const [retrySessionKey,setRetrySessionKey]=useState(0);
  const [mapReady,setMapReady]=useState(false);
  const mapRef=useRef(null);

  const selectedVehicle=useMemo(()=>vehicles.find(v=>String(v.id)===String(selectedVehicleId))||vehicles[0]||null,[vehicles,selectedVehicleId]);
  const latitude=Number(selectedVehicle?.latitude);
  const longitude=Number(selectedVehicle?.longitude);
  const hasPosition=Number.isFinite(latitude)&&Number.isFinite(longitude);
  const observedAt=selectedVehicle?.observed_at||selectedVehicle?.updatedAt||null;
  const ageMinutes=observedAt?Math.max(0,Math.floor((Date.now()-new Date(observedAt).getTime())/60000)):null;

  const refreshDiagnostics=useCallback(async()=>{
    try{
      const [nextConfig,nextDiagnostics,nextToken]=await Promise.all([getVehicleLocationConfig(),getLocationDiagnostics(),getLocationDeviceToken()]);
      setConfig(nextConfig||{});
      setDiagnostics(nextDiagnostics||{});
      setDeviceToken(nextToken||'');
      setTokenSaved(!!nextToken);
    }catch(e){setError(String(e?.message||'Nie udało się odczytać diagnostyki GPS.'));}
  },[]);

  const refreshVehicles=useCallback(async()=>{
    if(!user)return;
    setLoading(true);
    try{
      const rows=user.role==='locator'
        ? [await apiGetMyGps()].filter(Boolean)
        : (await apiGetGps()||[]);
      setVehicles(rows);
      setSelectedVehicleId(current=>current&&rows.some(v=>String(v.id)===String(current))?current:String(rows[0]?.id||''));
      setError('');
    }catch(e){setError(String(e?.message||'Nie udało się pobrać lokalizacji z API.'));}
    finally{setLoading(false);}
  },[user]);

  const refreshAll=useCallback(async()=>{
    await Promise.all([refreshVehicles(),refreshDiagnostics()]);
  },[refreshVehicles,refreshDiagnostics]);

  useEffect(()=>{
    let alive=true;
    setBooting(true);
    (async()=>{
      let cachedUser=null;
      try{
        const raw=await AsyncStorage.getItem(USER_CACHE_KEY);
        cachedUser=raw?JSON.parse(raw):null;
        if(alive&&cachedUser)setUser(cachedUser);
      }catch{}
      try{
        const current=await apiMe();
        await AsyncStorage.setItem(USER_CACHE_KEY,JSON.stringify(current));
        if(alive){setUser(current);setSessionRetry(false);setError('');}
      }catch(e){
        if(e?.status===401||e?.status===403){
          try{await apiLogout();}catch{}
          try{await AsyncStorage.removeItem(USER_CACHE_KEY);}catch{}
          if(alive){setUser(null);setSessionRetry(false);setError('Sesja wygasła. Zaloguj się ponownie.');}
        }else if(alive){
          if(cachedUser)setUser(cachedUser);
          setSessionRetry(true);
          setError(cachedUser?'Brak internetu. Pokazuję zapisany profil i lokalną diagnostykę; dane live odświeżą się po połączeniu.':'Nie można połączyć się z serwerem. Sprawdź internet i ponów próbę.');
        }
      }finally{if(alive)setBooting(false);}
    })();
    return()=>{alive=false;};
  },[retrySessionKey]);

  useEffect(()=>{
    if(!user)return;
    refreshAll();
    const timer=setInterval(()=>{refreshVehicles();refreshDiagnostics();},15000);
    const subscription=AppState.addEventListener('change',async state=>{
      if(state!=='active')return;
      try{
        const cfg=await getVehicleLocationConfig();
        if(user.role==='locator'&&cfg.enabled===true)await ensureVehicleLocationTracking();
      }catch(e){setError(String(e?.message||'Nie udało się wznowić kontroli GPS.'));}
      refreshAll();
    });
    return()=>{clearInterval(timer);subscription.remove();};
  },[user,refreshAll,refreshVehicles,refreshDiagnostics]);

  useEffect(()=>{
    if(!mapReady||!mapRef.current||!hasPosition)return;
    mapRef.current.injectJavaScript('window.setVehiclePoint&&window.setVehiclePoint('+latitude+','+longitude+'); true;');
  },[mapReady,latitude,longitude,hasPosition]);

  useEffect(()=>{
    const applyDeepLink=rawUrl=>{
      try{
        const parsed=new URL(rawUrl);
        if(parsed.protocol!=='grafikpracy3gf:')return;
        const parts=parsed.pathname.split('/').filter(Boolean);
        if(parsed.hostname==='vehicle'&&parts[0]){
          setSelectedVehicleId(decodeURIComponent(parts[0]));
          setInitialTripId('');
          setInitialTripVehicleId('');
        }else if(parsed.hostname==='trip'&&parts[0]&&parts[1]){
          const vehicleId=decodeURIComponent(parts[0]);
          setSelectedVehicleId(vehicleId);
          setInitialTripVehicleId(vehicleId);
          setInitialTripId(decodeURIComponent(parts[1]));
        }
      }catch{}
    };
    Linking.getInitialURL().then(url=>{if(url)applyDeepLink(url);}).catch(()=>{});
    const subscription=Linking.addEventListener('url',event=>applyDeepLink(event.url));
    return()=>subscription.remove();
  },[]);

  const login=async()=>{
    if(!email.trim()||!password)return;
    setBusy(true);setError('');
    try{const next=await apiLogin(email.trim(),password);await AsyncStorage.setItem(USER_CACHE_KEY,JSON.stringify(next));setUser(next);setSessionRetry(false);setPassword('');}
    catch(e){setError(e?.message==='INVALID_CREDENTIALS'?'Nieprawidłowy e-mail lub hasło.':String(e?.message||'Logowanie nie powiodło się.'));}
    finally{setBusy(false);}
  };

  const saveToken=async()=>{
    const value=deviceToken.trim();
    if(!value){setError('Wklej token urządzenia otrzymany od administratora.');return;}
    setBusy(true);setError('');
    try{await setLocationDeviceToken(value);setTokenSaved(true);await refreshDiagnostics();setError('');}
    catch(e){setError(String(e?.message||'Nie udało się zapisać tokenu urządzenia.'));}
    finally{setBusy(false);}
  };

  const startTracking=async()=>{
    if(user?.role!=='locator'){setError('Śledzenie można uruchomić wyłącznie na koncie lokalizatora.');return;}
    if(!tokenSaved){setError('Najpierw zapisz token urządzenia.');return;}
    setBusy(true);setError('');
    try{
      const result=await startVehicleLocationTracking({vehicleId:selectedVehicle?.id,registration:selectedVehicle?.registration});
      if(!result.ok){
        const messages={
          'device-token-missing':'Brak tokenu urządzenia.',
          'device-not-assigned':'Telefon nie jest przypisany do pojazdu.',
          'foreground-permission':'Brak zgody na lokalizację.',
          'background-permission':'Wymagana jest zgoda na lokalizację w tle.',
          'location-services-disabled':'Włącz lokalizację GPS w telefonie.',
          'api-not-configured':'Brak konfiguracji centralnego API.'
        };
        throw new Error(messages[result.reason]||('Nie udało się uruchomić GPS: '+result.reason));
      }
      await refreshAll();
    }catch(e){setError(String(e?.message||'Nie udało się uruchomić śledzenia GPS.'));}
    finally{setBusy(false);}
  };

  const stopTracking=async()=>{
    setBusy(true);setError('');
    try{await stopVehicleLocationTracking();await refreshDiagnostics();}
    catch(e){setError(String(e?.message||'Nie udało się zatrzymać GPS.'));}
    finally{setBusy(false);}
  };

  const logout=async()=>{
    setBusy(true);
    try{if(config.enabled===true)await stopVehicleLocationTracking();await apiLogout();}
    catch{}
    try{await AsyncStorage.removeItem(USER_CACHE_KEY);}catch{}
    setUser(null);setVehicles([]);setSelectedVehicleId('');setConfig({});setDiagnostics({});setBusy(false);
  };

  if(booting)return <SafeAreaView style={[styles.root,{justifyContent:'center',alignItems:'center'}]}><ActivityIndicator size="large" color="#4b8cff"/><Text style={styles.muted}>Uruchamianie 3gf…</Text></SafeAreaView>;

  if(!user)return <SafeAreaView style={styles.root}><ScrollView contentContainerStyle={[styles.page,{flexGrow:1,justifyContent:'center'}]}>
    <View style={styles.header}><Text style={styles.brand}>3gf</Text><Text style={styles.subtitle}>TELEMATYKA POJAZDÓW</Text><Text style={[styles.text,{marginTop:12}]}>Zaloguj się kontem z systemu Grafik Pracy, aby zobaczyć przypisany pojazd i jego historię.</Text></View>
    <View style={styles.card}><Text style={styles.title}>Logowanie</Text>
      <TextInput value={email} onChangeText={setEmail} placeholder="Adres e-mail" placeholderTextColor="#738197" autoCapitalize="none" keyboardType="email-address" style={styles.input}/>
      <TextInput value={password} onChangeText={setPassword} placeholder="Hasło" placeholderTextColor="#738197" secureTextEntry style={styles.input}/>
      <TouchableOpacity style={styles.button} disabled={busy} onPress={login}><Text style={styles.buttonText}>{busy?'LOGOWANIE…':'ZALOGUJ SIĘ'}</Text></TouchableOpacity>
      {!!error&&<Text style={styles.error}>{error}</Text>}
      {sessionRetry&&<TouchableOpacity style={[styles.button,styles.secondary]} onPress={()=>setRetrySessionKey(x=>x+1)}><Text style={styles.buttonText}>PONÓW POŁĄCZENIE</Text></TouchableOpacity>}
    </View>
    <Text style={styles.muted}>3gf korzysta z tego samego konta co Grafik Pracy. Nie tworzy osobnej bazy użytkowników.</Text>
  </ScrollView></SafeAreaView>;

  return <SafeAreaView style={styles.root}><ScrollView contentContainerStyle={styles.page}>
    <View style={styles.header}>
      <View style={styles.row}><View style={{flex:1}}><Text style={styles.brand}>3gf</Text><Text style={styles.subtitle}>TELEMATYKA POJAZDÓW</Text></View><TouchableOpacity style={[styles.button,styles.secondary,{marginTop:0}]} onPress={logout} disabled={busy}><Text style={styles.buttonText}>WYLOGUJ</Text></TouchableOpacity></View>
      <Text style={styles.muted}>{user.displayName||user.email} · {user.role}</Text>
    </View>

    {sessionRetry&&<View style={styles.card}><Text style={styles.warning}>TRYB OGRANICZONY · BRAK POŁĄCZENIA</Text><Text style={styles.muted}>Zapisany profil pozostaje dostępny. Po odzyskaniu internetu pobierz aktualną lokalizację i historię.</Text><TouchableOpacity style={[styles.button,styles.secondary]} onPress={()=>setRetrySessionKey(x=>x+1)}><Text style={styles.buttonText}>PONÓW POŁĄCZENIE</Text></TouchableOpacity></View>}

    {user.role==='locator'&&<View style={styles.card}>
      <Text style={styles.title}>Urządzenie GPS</Text>
      <Text style={styles.text}>Wklej token urządzenia przypisany przez administratora do tego telefonu i pojazdu. Token urządzenia jest oddzielny od hasła konta.</Text>
      <TextInput value={deviceToken} onChangeText={v=>{setDeviceToken(v);setTokenSaved(false);}} placeholder="Token urządzenia" placeholderTextColor="#738197" secureTextEntry style={styles.input} autoCapitalize="none"/>
      <TouchableOpacity style={[styles.button,styles.secondary]} disabled={busy} onPress={saveToken}><Text style={styles.buttonText}>{tokenSaved?'TOKEN ZAPISANY':'ZAPISZ TOKEN URZĄDZENIA'}</Text></TouchableOpacity>
      <View style={styles.row}>
        <TouchableOpacity style={[styles.button,{flex:1}]} disabled={busy||config.enabled===true} onPress={startTracking}><Text style={styles.buttonText}>{busy?'…':'URUCHOM GPS'}</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.button,styles.danger,{flex:1}]} disabled={busy||config.enabled!==true} onPress={stopTracking}><Text style={styles.buttonText}>ZATRZYMAJ</Text></TouchableOpacity>
      </View>
      <Text style={[styles.muted,config.enabled===true?styles.good:styles.warning]}>{config.enabled===true?'Śledzenie włączone':'Śledzenie wyłączone'}</Text>
    </View>}

    <View style={styles.card}>
      <View style={styles.row}><Text style={[styles.title,{marginBottom:0,flex:1}]}>Lokalizacja na żywo</Text><TouchableOpacity onPress={refreshAll} disabled={loading}><Text style={{color:'#75a8ff',fontWeight:'800'}}>{loading?'ODŚWIEŻANIE…':'ODŚWIEŻ'}</Text></TouchableOpacity></View>
      {user.role!=='locator'&&vehicles.length>0&&<View style={{flexDirection:'row',flexWrap:'wrap',marginTop:10}}>{vehicles.map(v=><TouchableOpacity key={v.id} onPress={()=>setSelectedVehicleId(String(v.id))} style={[styles.pill,String(selectedVehicle?.id)===String(v.id)&&styles.selected]}><Text style={styles.buttonText}>{v.registration||v.name||v.id}</Text></TouchableOpacity>)}</View>}
      {selectedVehicle?<><Text style={styles.text}>{selectedVehicle.registration||selectedVehicle.name||'Pojazd'} · {selectedVehicle.speed==null?'brak prędkości':Math.round(Number(selectedVehicle.speed)*3.6)+' km/h'}</Text>
        <Text style={styles.muted}>{hasPosition?latitude.toFixed(5)+', '+longitude.toFixed(5):'Brak odebranej pozycji GPS'}{ageMinutes!==null?' · '+ageMinutes+' min temu':''}</Text>
        <View style={styles.map}>{Platform.OS==='web'?<iframe title="Mapa 3gf" srcDoc={MAP_HTML} style={{width:'100%',height:'100%',border:0}}/>:<WebView ref={mapRef} originWhitelist={['*']} source={{html:MAP_HTML}} javaScriptEnabled domStorageEnabled onLoadEnd={()=>setMapReady(true)} onError={()=>setMapReady(false)} style={{flex:1,backgroundColor:'#0d131d'}}/>}</View>
      </>:<Text style={styles.muted}>Brak przypisanego pojazdu lub brak dostępu do lokalizacji.</Text>}
    </View>

    <View style={styles.card}>
      <Text style={styles.title}>Diagnostyka GPS</Text>
      <Text style={styles.text}>Ostatni pomiar lokalny: {diagnostics.lastTaskAt?new Date(diagnostics.lastTaskAt).toLocaleString('pl-PL'):'brak danych'}</Text>
      <Text style={styles.text}>Ostatnia wysyłka do serwera: {diagnostics.lastLiveUploadAt?new Date(diagnostics.lastLiveUploadAt).toLocaleString('pl-PL'):'brak danych'}</Text>
      <Text style={styles.text}>Punkty oczekujące offline: {Number(diagnostics.pendingGpsQueueLength)||0}</Text>
      {!!diagnostics.lastUploadError&&<Text style={styles.error}>Ostatni błąd wysyłki: {diagnostics.lastUploadError}</Text>}
      <Text style={styles.muted}>W Androidzie śledzenie działa jako usługa lokalizacji z widocznym powiadomieniem. System może ograniczyć działanie po wymuszonym zatrzymaniu aplikacji.</Text>
    </View>

    {selectedVehicle?.id?<TripHistoryPanel vehicleId={String(selectedVehicle.id)} initialTripId={initialTripVehicleId===String(selectedVehicle.id)?initialTripId:''}/>:null}
    {!!error&&<Text style={styles.error}>{error}</Text>}
  </ScrollView></SafeAreaView>;
}
