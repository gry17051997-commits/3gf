# Integracja 3gf z Grafik Pracy

## Decyzja
3gf jest osobną aplikacją Android w wariancie HYBRID. Grafik Pracy i 3gf pokazują mapy (BOTH). 3gf odpowiada za aktywny GPS, kolejkę offline, status urządzenia i historię. Grafik Pracy odpowiada za grafik, pracowników, magazyny i rozliczenia oraz wyświetla mapę floty.

## Najważniejsze ograniczenia aktualnego repo
1. W tej gałęzi 3gf otrzymało osobny `android.package = pl.grafikpracy.threegf`, nazwę `3gf`, slug `grafikpracy-3gf` i scheme `grafikpracy3gf`. Pozostaje zweryfikować instalację równoległą i aktualizację APK na fizycznym urządzeniu.
2. Repozytorium zawiera kopię backendu, `render.yaml` oraz definicję osobnej bazy. Nie wdrażać ich jako osobnego systemu produkcyjnego.
3. Docelowo 3gf korzysta z centralnego API w repozytorium GrafikPracyApp. Nie może tworzyć konkurencyjnej historii GPS ani osobnego rejestru pojazdów.
4. Obecna kolejka offline jest oparta o AsyncStorage, ma limit 250 punktów i wysyła FIFO. Przed zwiększeniem limitu lub zmianą magazynu potrzebne są testy i migracja zachowująca istniejące wpisy.
5. 3gf i Grafik Pracy mają własne pliki `apiClient.js`. Zachować osobne klienty, ale utrzymywać zgodny kontrakt endpointów i payloadów.

## Stan wydzielenia w tej gałęzi
- Punkt wejścia aplikacji uruchamia teraz `TelematicsApp.js`, a nie pełny `AppRuntime.js` Grafiku Pracy.
- Interfejs 3gf zawiera logowanie wspólnym kontem, konfigurację tokenu urządzenia, start/stop GPS, mapę live, diagnostykę i historię tras.
- Stare pliki grafiku pozostają w repozytorium jako nieaktywne pliki źródłowe na czas migracji; nie są ładowane przez punkt wejścia 3gf.
- Klucze AsyncStorage i nazwa zadania GPS zostały odseparowane prefiksem `3gf`.

## Integracja aplikacji
- 3gf wysyła punkty przez `POST /api/gps` z nagłówkiem `X-Device-Token`.
- 3gf odczytuje przypisanie przez `GET /api/gps/device`.
- Obie aplikacje odczytują pozycje przez endpointy centralnego API.
- 3gf otwierane z Grafiku Pracy otrzymuje wyłącznie identyfikator pojazdu/trasy i żądany ekran.
- Nie przekazywać bearer tokenu ani tokenu urządzenia w deep linku.
- SSO, jeśli zostanie dodane, musi używać jednorazowego kodu wymiany o krótkim TTL, a nie tokenu w URI.

## Nie wykonywać
- Nie zmieniać applicationId Grafiku Pracy.
- Nie uruchamiać `3gf/backend` jako drugiego produkcyjnego API.
- Nie używać `3gf/render.yaml` do tworzenia kolejnej bazy.
- Nie uruchamiać trackingu GPS równolegle w obu aplikacjach na jednym telefonie.
- Nie usuwać istniejącej kolejki AsyncStorage bez migracji i testu odzyskiwania.
