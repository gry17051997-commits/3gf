# 3gf: lista kontrolna niezależnego wydania

## Tożsamość aplikacji
- [ ] Unikalny Android applicationId (inny niż `pl.grafikpracy.app`).
- [ ] Nazwa aplikacji „3gf”.
- [ ] Osobna ikona i splash screen.
- [ ] Osobny scheme deep link.
- [ ] Niezależny versionCode.
- [ ] Potwierdzona instalacja równolegle z Grafik Pracy.

## GPS
- [ ] Start śledzenia wyłącznie po świadomym działaniu kierowcy.
- [ ] Foreground Service typu location i widoczne powiadomienie.
- [ ] Uprawnienia lokalizacji pierwszego planu i tła.
- [ ] Brak utraty pomiarów przy chwilowym braku sieci.
- [ ] Kolejka offline przetrwa restart procesu.
- [ ] FIFO i brak przeskakiwania nowych pomiarów przed zaległe.
- [ ] Diagnostyka pokazuje liczbę zaległych pomiarów i ostatni błąd.
- [ ] Wznowienie po powrocie aplikacji.
- [ ] Test restartu urządzenia i ograniczeń systemowych Androida.
- [ ] Jeden aktywny nadajnik GPS na urządzenie.

## API i bezpieczeństwo
- [ ] 3gf używa centralnego API Grafik Pracy.
- [ ] Token urządzenia jest oddzielny od tokenu użytkownika.
- [ ] Serwer ustala pojazd na podstawie przypisania urządzenia.
- [ ] Kierowca nie może odczytać cudzych pojazdów ani tras.
- [ ] Dyspozytor ma tylko dozwolony zakres danych.
- [ ] Starsze pomiary nie nadpisują bieżącej pozycji.
- [ ] Historia ma retencję 7 dni.
- [ ] Sekrety nie znajdują się w repozytorium ani deep linkach.

## Mapy i HYBRID
- [ ] Mapa działa w 3gf.
- [ ] Mapa działa w Grafik Pracy bez zainstalowanego 3gf.
- [ ] Pozycje i trasy są zgodne w obu aplikacjach.
- [ ] Deep link otwiera właściwy ekran/pojazd.
- [ ] Brak 3gf jest obsłużony bez awarii Grafiku Pracy.

## Build i testy
- [ ] GitHub Actions buduje osobny APK 3gf.
- [ ] GitHub Actions buduje Grafik Pracy bez regresji.
- [ ] Node testy backendu przechodzą.
- [ ] APK instalują się jednocześnie na tym samym urządzeniu.
- [ ] Testy dwóch urządzeń i kont zakończone.
- [ ] Rollback do poprzednich APK jest możliwy.
