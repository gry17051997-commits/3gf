# Zlecenie niezależnego audytu: Grafik Pracy

Audytuj dokładnie commit umieszczony w paczce. Nie zmieniaj kodu ani konfiguracji. Nie wykonuj wdrożeń.

## Priorytety
1. Błędy uniemożliwiające start aplikacji, crash JS/native, czarny ekran i błędny bootstrap.
2. Android APK: poprawność bundle JS, manifestu, uprawnień, prebuild i artefaktu.
3. GPS w foreground/background, obsługa restartu procesu, blokady ekranu, brak sieci, kolejka offline i odzyskiwanie pomiarów.
4. Mini mapa i mapa live, konfiguracja MapTiler oraz zgodność z referencyjną gałęzią `backup/2026-10-13-maptiler-working`.
5. Logowanie, role, przypisanie telefonu do pojazdu, dostęp administratora i autoryzacja API.
6. Synchronizacja grafiku, konflikty wersji, ręczne/locked assignments, zmiany tygodni, strefy czasowe i utrata danych.
7. Raporty godzinowe i powiadomienia, duplikaty, stare zdarzenia i zachowanie po restarcie.
8. Backend Express/PostgreSQL: walidacja, autoryzacja, transakcje, schemat, indeksy i sekrety.
9. GitHub Actions: deterministyczna instalacja, powielone workflow, skrypty naprawcze, eksport WWW i APK.
10. Testy brakujących ścieżek, wydajność, dostępność i utrzymywalność.

## Wymagania grafiku do sprawdzenia
- 10 h: 06:00-16:00 i 16:00-02:00, 300 PLN.
- 12 h: 06:00-18:00 i 18:00-06:00, 360 PLN.
- Pracownicy P, M, L; magazyny zgodnie z konfiguracją aplikacji.
- Generator nie może po cichu nadpisywać ręcznych lub zablokowanych przypisań.
- Zmiana konfiguracji jednego tygodnia nie może modyfikować innego tygodnia.
- Rozliczenia/ledger muszą być oddzielone od blokady grafiku.
- GPS ma pokazywać pojazd przypisany centralnie, a nie ufać lokalnemu numerowi rejestracyjnemu.

## Wymagana metoda
Prześledź krytyczne przepływy od UI przez lokalny stan i klienta API do backendu/bazy oraz z powrotem. Sprawdź przypadki brzegowe, obsługę wyjątków, retry, offline, race conditions i uprawnienia. Uruchom dostępne testy/build tylko wtedy, gdy środowisko pozwala, i wyraźnie odnotuj, czego nie uruchomiono.

## Format raportu
- Podsumowanie wykonawcze
- P0/P1/P2/P3
- Bezpieczeństwo i uprawnienia
- GPS/mapy
- Synchronizacja i integralność danych
- Reguły biznesowe
- Powiadomienia
- CI/CD i build
- Braki testów
- Konkretne rekomendacje oraz kolejność wdrożenia

Każde znalezisko musi mieć plik, mechanizm, warunek wystąpienia, wpływ, dowód i kroki reprodukcji. Odróżniaj potwierdzone błędy od hipotez.