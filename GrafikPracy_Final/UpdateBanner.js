import React,{useCallback,useEffect,useState} from 'react';
import {Alert,AppState,Platform,Text,TouchableOpacity,View} from 'react-native';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';

const RELEASES_URL='https://api.github.com/repos/gry17051997-commits/3gf/releases/latest';
const APK_NAME='3gf.apk';
const PACKAGE_NAME='pl.grafikpracy.threegf';
const APK_MIME='application/vnd.android.package-archive';
const versionParts=value=>String(value||'0').replace(/^v/i,'').split(/[.+-]/).map(part=>Number.parseInt(part,10)||0);
const isNewer=(remote,local)=>{
  const a=versionParts(remote),b=versionParts(local);
  for(let i=0;i<Math.max(a.length,b.length);i++){const x=a[i]||0,y=b[i]||0;if(x!==y)return x>y;}
  return false;
};

export default function UpdateBanner(){
  const [release,setRelease]=useState(null);
  const [busy,setBusy]=useState(false);
  const [progress,setProgress]=useState('');
  const currentVersion=Constants.expoConfig?.version||'0.0.0';
  const check=useCallback(async()=>{
    if(Platform.OS!=='android')return;
    try{
      const response=await fetch(RELEASES_URL,{headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});
      if(!response.ok)return;
      const data=await response.json();
      const version=String(data.tag_name||'').replace(/^v/i,'');
      const apk=(data.assets||[]).find(asset=>asset.name===APK_NAME&&asset.browser_download_url);
      if(version&&apk&&isNewer(version,currentVersion))setRelease({version,apk,notes:String(data.body||'').trim()});
      else setRelease(null);
    }catch(error){console.log('UPDATE_CHECK_ERROR',error?.message||error);}
  },[currentVersion]);
  useEffect(()=>{
    check();
    const subscription=AppState.addEventListener('change',state=>{if(state==='active')check();});
    return()=>subscription.remove();
  },[check]);
  const install=async()=>{
    if(!release||busy)return;
    setBusy(true);setProgress('Pobieranie aktualizacji…');
    try{
      const destination=(FileSystem.cacheDirectory||FileSystem.documentDirectory)+'3gf-update.apk';
      const result=await FileSystem.downloadAsync(release.apk.browser_download_url,destination);
      if(result.status!==200)throw new Error('APK_DOWNLOAD_HTTP_'+result.status);
      setProgress('Uruchamianie instalatora Androida…');
      const contentUri=await FileSystem.getContentUriAsync(result.uri);
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW',{
        data:contentUri,type:APK_MIME,flags:1
      });
      setProgress('');
    }catch(error){
      console.log('UPDATE_INSTALL_ERROR',error?.message||error);
      Alert.alert('Aktualizacja nie została uruchomiona',
        'Android może wymagać zezwolenia na instalowanie aplikacji z tego źródła. Otworzę odpowiednie ustawienie.',
        [{text:'Otwórz ustawienia',onPress:async()=>{
          try{await IntentLauncher.startActivityAsync('android.settings.MANAGE_UNKNOWN_APP_SOURCES',{data:'package:'+PACKAGE_NAME});}
          catch(e){Alert.alert('Ustawienia','Włącz instalowanie nieznanych aplikacji dla Grafik Pracy i ponownie wybierz Aktualizuj.');}
        }},{text:'Później',style:'cancel'}]);
    }finally{setBusy(false);setProgress('');}
  };
  if(!release)return null;
  return <View style={{marginHorizontal:12,marginTop:7,marginBottom:8,padding:12,borderRadius:13,backgroundColor:'#173b2d',borderWidth:1,borderColor:'#2f8a62'}}>
    <Text style={{color:'#fff',fontWeight:'900',fontSize:14}}>⬆ Dostępna aktualizacja 3gf {release.version}</Text>
    {!!release.notes&&<Text numberOfLines={3} style={{color:'#d1fae5',fontSize:11,marginTop:4}}>{release.notes}</Text>}
    <TouchableOpacity disabled={busy} onPress={install} style={{marginTop:9,padding:11,borderRadius:9,backgroundColor:'#2e9d69',alignItems:'center',minHeight:44,justifyContent:'center'}}>
      <Text style={{color:'#fff',fontWeight:'900'}}>{busy?(progress||'AKTUALIZOWANIE…'):'AKTUALIZUJ'}</Text>
    </TouchableOpacity>
  </View>;
}
