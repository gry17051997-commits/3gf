Plan architektoniczny migracji 3GF

1. Cel dokumentu

Dokument określa bezpieczny plan porządkowania repozytorium "3gf". Jest dokumentem planistycznym. Sam w sobie nie zmienia kodu, działania aplikacji ani konfiguracji wdrożenia.

Celem jest stopniowe poprawianie czytelności i łatwości utrzymania projektu bez utraty istniejących funkcji i bez powielania wcześniejszych prac.

2. Zasady bezpieczeństwa

1. Utrzymujemy jeden projekt w jednym repozytorium.
2. Nie wykonujemy bezpośrednich commitów na "main".
3. Nie usuwamy istniejących gałęzi, kopii zapasowych ani plików.
4. Nie zmieniamy zachowania aplikacji, backendu, GPS, map ani synchronizacji w ramach prac dokumentacyjnych.
5. Nie dodajemy płatnych usług ani nowych kosztów.
6. Każda zmiana kodu wymaga osobnego przeglądu i testów.
7. Każdy PR powinien zawierać opis ryzyka, zakres zmienionych plików, wyniki faktycznie wykonanych testów i instrukcję wycofania zmiany.
8. Nie uznajemy funkcji za sprawdzoną tylko dlatego, że odpowiedni kod istnieje w repozytorium.

3. Obecny stan projektu

Repozytorium zawiera aplikację Expo/React Native, centralne API Express i bazę PostgreSQL. Aktualne działanie poszczególnych funkcji wymaga osobnej weryfikacji.

Istotne lokalizacje do analizy:

- "GrafikPracy_Final/" - aplikacja.
- "GrafikPracy_Final/apiClient.js" - komunikacja aplikacji z API.
- "GrafikPracy_Final/AppRuntime.js" - główny runtime aplikacji.
- "GrafikPracy_Final/LocationService.js" - obsługa lokalizacji.
- "GrafikPracy_Final/scheduleEngine.js" - logika harmonogramu.
- "GrafikPracy_Final/tests/production-hardening.test.js" - istniejące testy.
- "backend/server.js" - backend Express.
- "backend/schema.sql" - schemat bazy danych.
- "render.yaml" - konfiguracja wdrożenia.
- "docs/audits/" - istniejące materiały audytowe.
- "docs/repo-cleanup/" - istniejące materiały porządkowania repozytorium.

Powyższa lista wskazuje obszary do analizy, a nie potwierdzenie poprawnego działania wszystkich funkcji.

4. Zasada wykorzystania wcześniejszych prac

Przed rozpoczęciem nowego zadania należy przejrzeć istniejące dokumenty audytowe, dostępne gałęzie robocze i kopie zapasowe związane z danym obszarem.

Należy porównać proponowaną zmianę z wcześniejszymi rozwiązaniami i unikać powielania już wykonanej pracy.

Szczególną ostrożność należy zachować przy GPS działającym w tle, mapach, synchronizacji, logowaniu i obsłudze danych offline.

5. Obszary architektoniczne

5.1. API i autoryzacja

Do przyszłej analizy należą timeouty żądań, obsługa błędów HTTP, logowanie, sesje i uprawnienia.

Zmiany w ogólnej warstwie API mogą wpływać na logowanie, GPS i synchronizację. Przed ich wdrożeniem należy sprawdzić zależności oraz przygotować testy regresyjne.

5.2. Harmonogram

Należy zachować istniejące zasady generowania grafiku, ręcznych zmian, synchronizacji i przechowywania danych. Ewentualne wydzielanie modułów musi zachować zgodność z aktualnym modelem danych.

5.3. GPS i lokalizacja w tle

Należy zachować istniejący natywny mechanizm lokalizacji oraz przeanalizować obsługę działania w tle, błędów sieciowych, ponawiania wysyłki i danych offline.

Przed nowymi zmianami trzeba porównać dostępne poprawki i audyty GPS. Nie wolno zastępować istniejącego rozwiązania bez analizy i testów.

5.4. Mapy

Należy zachować istniejące rozwiązanie mapowe do czasu porównania aktualnej implementacji z dostępnymi wersjami i wcześniejszymi poprawkami.

Nie zmieniamy dostawcy map ani sposobu renderowania mapy wyłącznie w ramach porządkowania kodu.

5.5. Raporty, administracja i ustawienia

Przed ewentualnym wydzieleniem tych obszarów należy ustalić ich zależności od API, ról użytkowników, harmonogramu i lokalnego przechowywania danych.

6. Proponowana kolejność przyszłych prac

Etap 1: audyt

- Sprawdzić aktualny stan gałęzi bazowej.
- Przejrzeć istniejące dokumenty audytowe.
- Zidentyfikować zależności między aplikacją, API i backendem.
- Spisać istniejące testy i braki w pokryciu.
- Nie zmieniać kodu produkcyjnego.

Etap 2: stabilizacja API

- Przeanalizować obsługę timeoutów i błędów sieciowych.
- Sprawdzić wpływ zmian na logowanie, GPS i synchronizację.
- Dodać lub zaktualizować testy przed modyfikacją kodu.
- Wdrożyć ewentualną poprawkę dopiero w osobnym PR.

Etap 3: wydzielanie modułów

Dopiero po audycie można rozważyć stopniowe porządkowanie obszarów autoryzacji, harmonogramu, GPS, raportów i administracji.

Każdy obszar musi mieć osobny zakres zmian, testy oraz plan wycofania.

Etap 4: ewentualna zmiana struktury repozytorium

Nie przenosimy teraz katalogów i nie tworzymy nowej struktury tylko dla estetyki. Każda taka zmiana wymaga osobnego uzasadnienia, sprawdzenia workflow CI, konfiguracji wdrożenia i zgodności aplikacji Android oraz WWW.

7. Kryteria akceptacji zmian

Przed zaakceptowaniem każdego PR należy sprawdzić:

1. Czy zakres zmian odpowiada celowi zadania.
2. Czy lista zmienionych plików jest zgodna z deklaracją.
3. Czy istniejące testy zostały uruchomione, a wyniki są udokumentowane.
4. Czy nie naruszono GPS, map, synchronizacji ani logowania.
5. Czy nie wprowadzono płatnych usług.
6. Czy istnieje możliwość wycofania zmiany.
7. Czy wdrożenie nie zostało wykonane bez osobnej zgody.

Testy na prawdziwym telefonie należy opisać jako niewykonane, dopóki faktycznie nie zostaną przeprowadzone.

8. Działania zabronione bez osobnej zgody

- Bezpośrednie zmiany na "main".
- Usuwanie gałęzi lub kopii zapasowych.
- Duży refactor wielu obszarów naraz.
- Zmiana backendu lub schematu bazy bez analizy kompatybilności.
- Zmiana działania GPS i map bez osobnej weryfikacji.
- Merge i wdrożenie w ramach zadania dokumentacyjnego.
- Dodawanie płatnych usług.

9. Oczekiwany rezultat

Celem jest lepiej udokumentowane, łatwiejsze w utrzymaniu repozytorium, przy zachowaniu istniejącego modelu aplikacji i backendu.

Ten dokument nie potwierdza, że aplikacja, GPS, mapy, synchronizacja, testy lub wdrożenie działają poprawnie. Opisuje wyłącznie zasady i kolejność przyszłych prac.

Każda zmiana produkcyjna wymaga osobnego przeglądu, testów i zgody.
