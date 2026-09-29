# ZipRun

Aplikacja PWA z planami treningowymi dla bieżni z Bluetooth LE — alternatywa dla
płatnych planów w FitShow. Łączy się z bieżnią bezpośrednio z przeglądarki
(Web Bluetooth), prowadzi trening głosowo i — jeśli bieżnia na to pozwala —
sama ustawia prędkość i nachylenie.

Wszystko działa lokalnie na telefonie. Żadne dane nie są nigdzie wysyłane,
nie ma kont ani logowania.

## Wymagania

- **Chrome lub Edge na Androidzie.** Web Bluetooth nie istnieje na iOS ani
  w Firefoksie — to ograniczenie systemu, nie aplikacji.
- **HTTPS.** Przeglądarka udostępnia Bluetooth tylko stronom z bezpiecznego
  kontekstu. Sposoby uruchomienia opisane niżej.
- Bieżnia z BLE. **FitShow musi być całkowicie zamknięty** — Bluetooth LE
  dopuszcza tylko jedno aktywne połączenie z urządzeniem.

## Uruchomienie

### Wariant A — GitHub Pages (docelowy)

Darmowy hosting HTTPS, aplikacja instalowalna na telefonie, działa też offline.
Wymaga konta GitHub; repozytorium na darmowym planie musi być publiczne, żeby
Pages działało.

```bash
git remote add origin https://github.com/TWOJ-LOGIN/ziprun.git
git push -u origin main
```

Następnie w repozytorium: **Settings → Pages → Source: Deploy from a branch →
`main` / `(root)` → Save**. Po chwili aplikacja będzie pod
`https://TWOJ-LOGIN.github.io/ziprun/`.

Na telefonie otwórz ten adres w Chrome i wybierz **⋮ → Dodaj do ekranu
głównego** — dostaniesz ikonę i pełny ekran bez paska adresu.

### Wariant B — sieć lokalna, bez publikowania czegokolwiek

Do testów, gdy nie chcesz nic wystawiać do internetu. Komputer i telefon muszą
być w tej samej sieci Wi-Fi.

Na komputerze:

```bash
node tools/serve.js 8787
```

Na telefonie w Chrome wejdź na `chrome://flags`, znajdź
**Insecure origins treated as secure**, wpisz tam adres komputera
(np. `http://192.168.33.17:8787`), przełącz na *Enabled* i zrestartuj Chrome.
Od tej chwili ten adres jest traktowany jak bezpieczny i Bluetooth zadziała.

Minus: działa tylko przy włączonym komputerze w tej samej sieci.

### Wariant C — przeciągnij i upuść

Cloudflare Pages albo Netlify Drop przyjmują cały katalog przez stronę WWW
i od razu dają adres HTTPS. Bez repozytorium i bez publikowania kodu źródłowego.

## Pierwsze uruchomienie — kolejność

1. **Profil.** Ustaw dwie prędkości: *swobodną* (taką, przy której możesz
   rozmawiać) i *szybką* (utrzymasz ją około trzech minut). Wszystkie plany
   liczą się z tych dwóch liczb, więc zawyżone wartości dadzą plan nie do
   wykonania. Limity prędkości i nachylenia ustawią się same po połączeniu
   bieżni.

   Wiek ani masa ciała nie są potrzebne — prędkości od nich nie zależą.
   Masa służy tylko awaryjnemu szacowaniu kalorii, gdy bieżnia nie podaje ich
   sama, i jest przyjęta na stałe (80 kg). FitShow zachowuje się identycznie:
   zmiana wagi, wieku i wzrostu nie wpływa tam na prędkości w trakcie treningu.
2. **Bieżnia → Wybierz i połącz.** Aplikacja sama rozpozna, czy bieżnia mówi
   standardem FTMS, czy protokołem własnościowym.
3. **Diagnostyka** (opis niżej) — jednorazowo, żeby potwierdzić protokół.
4. **Test sterowania** — zanim wejdziesz na pas.
5. Dopiero potem trening.

## Diagnostyka protokołu

Bieżnie sprzedawane z FitShow używają dwóch różnych języków. Aplikacja obsługuje
oba, ale drugi wymaga jednorazowego rozpoznania.

**FTMS** (`0x1826`) to otwarty standard Bluetooth SIG. Jeśli bieżnia go
udostępnia razem z *Control Pointem*, sterowanie działa od razu — nic nie trzeba
ustawiać.

**Protokół własnościowy** (najczęściej usługa `0xFFF0`) nie jest udokumentowany.
Aplikacja potrafi go podsłuchać i wysyłać ramki, ale numery komend trzeba
odczytać z zachowania konkretnej bieżni.

Procedura:

1. Zakładka **Bieżnia** → *Uruchom diagnostykę*. Aplikacja odczyta całe drzewo
   GATT i zacznie nasłuchiwać.
2. Teraz **ręcznie**, na konsoli bieżni, zmień prędkość kilka razy (np. 3 → 6 →
   9 km/h), potem nachylenie. W logu zobaczysz ramki — bajty, które zmieniają
   się razem z prędkością, to szukane pole.
3. *Eksportuj raport* zapisuje wszystko do pliku tekstowego.
4. Jeśli protokół jest własnościowy, opcode'y wpisuje się w
   [`js/ble/proprietary.js`](js/ble/proprietary.js) w stałej `OPCODES`.
   Pole *ręczna ramka hex* pozwala testować hipotezy na żywo.

## Bezpieczeństwo

Automatyczne sterowanie oznacza, że aplikacja zmienia prędkość pasa pod Twoimi
stopami. Zabezpieczenia w kodzie:

- **Stopniowe rampowanie** — prędkość zmienia się skokami po 0,5 km/h, nigdy
  z 6 na 16 od razu.
- **Zapowiedź wyprzedzająca** — zmiana jest ogłaszana głosem zanim nastąpi,
  a rozpędzanie zaczyna się przed końcem poprzedniego odcinka, żeby na starcie
  interwału pas był już na docelowej prędkości.
- **Limit prędkości i nachylenia z bieżni** — przy każdym połączeniu profil
  przyjmuje zakres, który bieżnia zgłasza w standardzie FTMS. Plan ani korekta
  nie wyjdą poza niego. Zakres domyślny sterownika, gdy odczyt się nie uda,
  nie zmienia limitów.
- **Reakcja na kluczyk bezpieczeństwa** — wyjęcie kluczyka przerywa trening.
- **Brak komend po zatrzymaniu** — żadna zakolejkowana komenda prędkości nie
  dotrze do bieżni po pauzie ani po stopie.
- **Utrata połączenia** wstrzymuje trening i uruchamia ponowne łączenie.
- **Czekanie na ruszenie pasa** — po komendzie Start bieżnia odlicza jeszcze
  kilka sekund na własnej konsoli. Zegar treningu rusza dopiero, gdy pas
  faktycznie jedzie, więc pierwszy odcinek nie ucieka na stojąco.

Mimo to: pierwszy test sterowania rób **stojąc obok pasa, nie na nim**,
z ręką przy wyłączniku.

## Zbadany sprzęt: Zipro Newlite (moduł FS-BT-C1)

Wynik sesji diagnostycznej z 8 września 2026, nazwa BLE `FS-B13AA3`,
producent modułu `FITSHOW`, firmware `V2.6.3`:

| Cecha | Wynik |
|---|---|
| Protokół | **FTMS** (`0x1826`) — standard Bluetooth SIG, nie wymaga reverse-engineeringu |
| Control Point (`0x2AD9`) | jest, `write` + `indicate` |
| Request Control (`0x00`) | potwierdzone — odpowiedź `80 00 01` |
| Start / Resume (`0x07`) | potwierdzone — odpowiedź `80 07 01` |
| Set Target Speed (`0x02`) | **potwierdzone** — `80 02 01`, pas faktycznie zmienia prędkość |
| Stop / Pause (`0x08`) | potwierdzone — odpowiedź `80 08 01` |
| Opóźnienie komendy | 150–500 ms od zapisu do zmiany na pasie |
| Odliczanie po Start | **~5 s** zanim pas ruszy — konsola odlicza sama |
| Zakres prędkości | 1,0–12,0 km/h, krok 0,1 |
| Nachylenie | **brak** — pochylnia niesterowana i nieobecna fizycznie |
| Dane bieżące | prędkość, dystans, czas, kalorie, tętno (przez pas piersiowy) |

Bieżnia równolegle nadaje ten sam strumień protokołem własnościowym FitShow na
`0xFFF0`, ale jest on w tym przypadku zbędny — FTMS pokrywa wszystko.

Konsekwencje dla planów: górna granica 12 km/h oznacza, że warto ustawić
*tempo szybkie* w okolicach 11 km/h, żeby kotwice `tempo`, `próg` i `VO2max`
nie zlały się w jedną wartość. Plany oparte na pochylni (marsz 12-3-30,
podbiegi) zostały zastąpione odpowiednikami na płaskim — utrzymywanie ich
byłoby udawaniem, że sprzęt potrafi coś, czego nie potrafi.

## Plany treningowe

Piętnaście planów, od marszobiegu po interwały norweskie 4×4. Prędkości nie
są zapisane na sztywno — każdy plan przelicza się z Twojego profilu, więc rośnie
razem z formą i nie trzeba go przepisywać.

Poziomy: 1 — łatwe, 2 — średnie, 3 — mocne.

Jeden plan jest wyjątkiem od skalowania: „Spalanie tłuszczu 30 min" to
odtworzony co do sekundy plan „30 Minute Fat Burning Run" z aplikacji FitShow,
z prędkościami wpisanymi wprost (3,5 / 8,0 / 9,0 / 5,0 / 4,5 km/h). Ręczna
korekta ±0,5 km/h w trakcie treningu działa na nim normalnie.

## Struktura

```
index.html            interfejs (widoki jako sekcje)
app.css               ciemny motyw, duża typografia do czytania w ruchu
edit.html             edytor planów (adres /edit)
js/editor/model.js    model edytora: odcinki, grupy, walidacja, podsumowanie
js/editor/link.js     plan w linku: zapis i ścisły odczyt
js/editor/app.js      ekran edytora
js/tekst.js           esc() i odmiana liczebników — wspólne dla obu stron
js/ui/import.js       podgląd planu z linku na telefonie
js/app.js             punkt wejścia: import widoków, start aplikacji
js/ui/core.js         wspólny stan, bieżnia, silnik, rejestrator, drobne narzędzia
js/ui/nav.js          przełączanie widoków i gest wstecz
js/ui/charts.js       wykresy profilu i listy odcinków
js/ui/plan-list.js    lista planów, szczegóły, ulubione, start treningu
js/ui/creator.js      kreator własnych planów
js/ui/run.js          ekran treningu i domknięcie zapisu
js/ui/summary.js      podsumowanie treningu
js/ui/history.js      historia i lista zapisów technicznych
js/ui/profile.js      profil, ustawienia, kopia danych
js/ui/device.js       zakładka Bieżnia: połączenie, diagnostyka, testy
js/ui/changelog.js    numer wersji i historia zmian
js/plans.js           definicje planów i przeliczanie kotwic wysiłku
js/engine.js          maszyna stanów treningu, rampowanie, zapowiedzi
js/speech.js          synteza mowy i blokada wygaszania ekranu
js/storage.js         profil, historia, ustawienia (localStorage)
js/trace.js           zapis techniczny treningu i eksport do pliku
js/version.js         numer wersji i historia zmian
js/ble/uuids.js       identyfikatory usług i charakterystyk
js/ble/ftms.js        sterownik standardu FTMS
js/ble/proprietary.js sterownik protokołów własnościowych + sniffer
js/ble/diagnostics.js zrzut GATT i eksport raportu
js/ble/manager.js     połączenie, dobór sterownika, rampa prędkości
sw.js                 service worker (działanie offline)
tools/serve.js        lokalny serwer do testów
tools/make-icons.js   generator ikon PWA
tests/                testy automatyczne (node --test)
```

## Testy

```bash
npm test          # albo: node --test
```

Wymagają tylko Node 20 lub nowszego — bez `npm install`, bez zależności.
Wszystko, co potrzebuje przeglądarki albo Bluetooth, zastępują atrapy
z [`tests/helpers.mjs`](tests/helpers.mjs): pamięć w obiekcie zamiast
localStorage, zegar przesuwany ręcznie i bieżnia, która tylko zapisuje
komendy. Cały zestaw trwa około sekundy.

| Plik | Co pilnuje |
|---|---|
| `engine.test.mjs` | rampa rusza tyle przed granicą, ile trwa zmiana; po pauzie i stopie żadna komenda prędkości nie dociera do pasa; kluczyk przerywa trening; przejmowanie tempa z panelu z jego pięcioma warunkami i granicami 0,5–1,5 |
| `generator.test.mjs` | każda kombinacja typu, intensywności i długości trwa co do sekundy tyle, ile zamówiono; rozgrzewka wolniejsza od treningu; przerwy tylko w interwałach |
| `plans.test.mjs` | wszystkie plany wbudowane rozwiązują się poprawnie; kotwice rosną; plan z FitShow nie zależy od profilu |
| `storage.test.mjs` | import scala zamiast zastępować i nie duplikuje; naprawy starych planów; limit zapisów technicznych przy zapełnionej pamięci |
| `ftms.test.mjs` | parsowanie ramek Treadmill Data i Feature, w tym odwrócony bit „More Data" |
| `trace.test.mjs` | zapis techniczny: throttling pomiarów, hamowanie po treningu, raport i jego odtworzenie z pamięci |
| `charts.test.mjs` | uśrednianie przebiegu i proporcje wykresu |
| `editor.test.mjs` | pola edytora, grupy i powtórzenia, numeracja „Praca N", przewyższenie, format listy; link w obie strony i odrzucanie spreparowanych linków |
| `spojnosc.test.mjs` | każdy moduł jest na liście service workera, każdy `$('id')` ma element w `index.html`, każdy import ma swój eksport, wersja ma wpis w historii zmian |

Ostatni plik łapie dokładnie tę klasę błędów, która w 1.7.x wysypała
trening na telefonie — na komputerze jej nie widać, bo tam pliki przychodzą
z sieci, a nie z pamięci offline.

Testy nie zastępują próby na bieżni: sprawdzają logikę, nie to, czy
konkretny pas posłucha komendy.

## Własne plany

Przycisk „Ułóż własny plan" nad listą otwiera generator. Podajesz trzy rzeczy —
długość, rodzaj treningu i intensywność — a resztę wylicza kod:

| Rodzaj | Budowa rdzenia |
|---|---|
| Spalanie tłuszczu | falujące bloki po około cztery minuty, nisko w strefie tlenowej |
| Interwały | serie o stałej długości przedzielone truchtem |
| Wytrzymałość | jeden ciągły blok w równym tempie |
| Narastający | kolejne stopnie w górę drabinki wysiłku, szczyt na końcu |
| Marsz i regeneracja | spokojny marsz, przy wyższej intensywności lekko falujący |

Rozgrzewka i schłodzenie dostają tempo **o szczebel niższe niż najlżejszy
odcinek treningu właściwego**, ale nigdy wyższe niż marsz. Przed biegiem
rozgrzewką zostaje więc marsz, a przed treningiem marszowym — spacer.
Wcześniej rozgrzewka miała zawsze tempo marszu, przez co w planie marszowym
sześć minut „rozgrzewki" szło dokładnie tym tempem, co potem cały trening.

Długość rozgrzewki i schłodzenia rośnie wraz z treningiem (18% i 14% całości,
z ograniczeniami), a przy bardzo krótkim treningu ustępuje miejsca części
właściwej. Suma odcinków jest zawsze **dokładnie** równa zamówionemu czasowi —
plan „na 40 minut" trwa czterdzieści minut co do sekundy.

Prędkości zapisują się jako kotwice wysiłku, nie jako km/h — dokładnie tak samo
jak w planach wbudowanych. Własny plan skaluje się więc razem z profilem
i nie trzeba go przepisywać po zmianie formy.

Plany leżą w localStorage (maksymalnie 50), wchodzą do kopii danych i wracają
z importu; scalane są po identyfikatorze, więc ponowny import nic nie duplikuje.
Na liście mają odznakę „mój" i własny filtr; usunąć można tylko własny plan,
bo wbudowanego nie dałoby się odtworzyć.

## Edytor planów na komputerze

Pod adresem [`/edit`](https://marek-musielak.github.io/my-ziprun/edit) plan
układa się z odcinków o zadanym czasie, prędkości (1–22 km/h) i nachyleniu
(0–20 %, puste pole to 0 %). Czas wpisuje się jako sekundy (`90`) albo minuty
i sekundy (`1:30`).
Rodzaj odcinka zmienia się kliknięciem: praca → przerwa → schłodzenie →
rozgrzewka. Sąsiednie odcinki łączą się w grupę z liczbą powtórzeń 1–50.

Na bieżąco widać łączny czas, dystans, przewyższenie i wykres, a pod nim listę
odcinków w postaci `04m00s [6:00] /4%` — czas, tempo na kilometr i nachylenie
w terenie. Przewyższenie liczone jest z połowy nachylenia bieżni: pas nie daje
tego, co prawdziwe zbocze, więc 10 km na 20 % to 1 km w górę.

„Generuj" kopiuje link `…/my-ziprun/#plan=…`. Otwarty w Chrome na telefonie
pokazuje podgląd planu z przyciskiem „Dodaj do moich planów". Edytor pamięta
ostatni plan razem z jego identyfikatorem, więc poprawiony i wysłany jeszcze
raz plan pokazuje „Zaktualizuj plan" i zastępuje poprzednią wersję zamiast
dokładać kopię. „Nowy plan" zaczyna od zera.

Plan jedzie po `#`, bo ta część adresu nie wychodzi z przeglądarki — nie trafia
na serwer. Telefon sprawdza link w całości i sam nadaje nazwy odcinków
(„Praca 1", „Przerwa"…), a nazwy planów i urządzeń wyświetla jako zwykły tekst,
więc spreparowany link nie przemyci na stronę własnego kodu.

Prędkości są wpisane liczbą, jak w planie z FitShow — plan z edytora nie
skaluje się z profilem.

### Obowiązkowe schłodzenie

Po ostatnim odcinku planu z edytora pas przechodzi na **15 minut marszu:
dokładnie 4 km/h i 0 %**, bez skali z panelu i bez korekt. Edytor ani
szczegóły planu tego nie pokazują — to nie jest odcinek planu.

Schłodzenie nie wlicza się do wyniku. Trening trafia do historii jako
ukończony już w chwili przejścia, a ekran odlicza samo schłodzenie, z wynikiem
zamrożonym w wierszu pod prędkością („3,09 km · 530 m up · czas 21:00").
Podsumowanie pojawia się po kwadransie albo wcześniej — po „Zakończ trening"
lub zatrzymaniu pasa z konsoli; wynik jest w obu przypadkach ten sam.

Przewyższenie w wynikach (podsumowanie, historia, zestawienie) liczy się
z tego, co pas faktycznie zrobił: przyrost dystansu razy połowa nachylenia
zgłoszonego przez bieżnię.

Link otwieraj w Chrome, nie we wbudowanej przeglądarce komunikatora: ta ma
osobną pamięć, więc plan dodany tam nie pojawiłby się w aplikacji.

## Co widać bez czytania

Karta planu na liście ma miniaturę profilu prędkości — ten sam wykres co
w szczegółach, tylko niski. Kształt treningu (jeden długi blok, fala, gęste
serie) rozpoznaje się rzutem oka, bez wchodzenia w szczegóły. Rysuje go ta sama
funkcja co duży wykres, więc nie ma jak się rozjechać, i nie dokłada ani
jednego pliku.

Na ekranie treningu za pierścieniem świeci poświata w kolorze bieżącego
odcinka: pomarańczowa przy pracy, zielona przy przerwie, niebieska przy
rozgrzewce, szara przy schłodzeniu. Nagłówek odcinka ma ten sam kolor.
Z odległości ramienia, przy drgającym obrazie, widać fazę treningu, zanim
zdąży się przeczytać nazwę. Całość to jeden atrybut `data-kind` i kilka
reguł CSS — żadnej grafiki.

## Odliczanie do zmiany tempa

Przez ostatnie pięć sekund odcinka środek pierścienia przestaje pokazywać
czas i zaczyna odliczać: **5, 4, 3, 2, 1**, a pod cyfrą stoi nazwa i prędkość
odcinka, który nadchodzi. Sama cyfra zostaje biała — kolorowanie jej barwą
nadchodzącego odcinka mieszało się z poświatą wokół pierścienia i sprawiało,
że najważniejsza liczba na ekranie zmieniała wygląd co odcinek.

Pięć sekund, bo dziesięć to już zapowiedź głosowa, a trzy byłoby za późno,
żeby zdążyć się przygotować. Odliczanie nie pojawia się na ostatnim odcinku —
tam nie ma nic dalej.

Wcześniej mówił o tym tylko mały napis „Rozpędzam do…" pod prędkością.
To pole wróciło do jednej roli: mówi, co będzie dalej.

## Ulubione

Każdy plan — wbudowany i własny — można oznaczyć przyciskiem „☆ Ulubiony"
w jego szczegółach. Ulubione trafiają na górę listy niezależnie od wybranego
filtra i mają własny filtr „★ Ulubione". Wewnątrz grup kolejność zostaje
bez zmian, więc lista nie tasuje się przy każdym wejściu.

Zapisywane są **same identyfikatory**, nie kopie planów: ulubiony plan
wbudowany zostaje ulubiony także po zmianie jego odcinków w nowej wersji
aplikacji. Usunięcie własnego planu czyści też jego wpis w ulubionych.
Lista wchodzi do kopii danych i scala się przy imporcie, więc import
z drugiego telefonu niczego tutaj nie odznacza.

## Ekran treningu: tryb kompaktowy i pełny

Domyślny jest **tryb kompaktowy**: duże odliczanie odcinka, duża prędkość
faktyczna, pasek postępu całego treningu i jeden wiersz z dystansem, kaloriami
i czasem do końca. Nie ma przycisków sterowania — założenie jest takie, że
prędkość i zatrzymanie obsługujesz z panelu bieżni.

**Pełny panel** dokłada kafelki z pomiarami oraz korekty ±0,5 km/h, pauzę,
przeskok odcinka i duży przycisk zatrzymania. Przełącznik jest na samym ekranie
treningu oraz w Profilu; wybór jest zapamiętywany.

W obu trybach zostaje przycisk kończący trening: gdy zatrzymasz pas z konsoli
bieżni, aplikacja wchodzi w pauzę i czeka na decyzję.

## Co aplikacja wie o zmianach z panelu bieżni

| Zdarzenie na konsoli | Reakcja aplikacji |
|---|---|
| Ręczna zmiana prędkości | **Przejmuje** ją: nowa prędkość staje się skalą reszty planu. Wykrywana z rozjazdu między prędkością zamówioną a raportowaną — patrz niżej. |
| Zatrzymanie lub pauza | **Reaguje** — status `02` wstrzymuje trening. |
| Wyjęcie kluczyka bezpieczeństwa | **Reaguje** — status `03` przerywa trening. |
| Start | Widzi status `04`; wykorzystywane przy czekaniu na ruszenie pasa. |

Zipro Newlite nie wysyła zdarzenia „użytkownik zmienił prędkość" — w żadnym
z dwóch raportów diagnostycznych nie ma takiej ramki, mimo że prędkość była
zmieniana ręcznie wielokrotnie. Jedynym śladem jest więc rozjazd: pas biegnie
inaczej, niż mu kazaliśmy.

### Podążanie za panelem

Wnioskowanie jest ostrożne, bo pomyłka po cichu przeskalowałaby cały trening.
Prędkość z panelu zostaje przyjęta dopiero wtedy, gdy **wszystkie** warunki są
spełnione naraz:

- aplikacja nie prowadzi właśnie własnej rampy,
- minęły co najmniej 2 sekundy od jej ostatniej komendy,
- pas trzyma tę samą prędkość przez 3 sekundy — wartości przelotowe w trakcie
  rozpędzania nie są niczyją decyzją,
- różnica wobec planu wynosi co najmniej 0,2 km/h,
- pas się kręci (powyżej 0,5 km/h), więc rozbieg ze stania nie liczy się.

Przyjęcie **nie wysyła żadnej komendy** — pas jest już tam, gdzie chciał go
użytkownik. Zmienia się natomiast skala całego planu: stosunek nowej prędkości
do zaplanowanej obowiązuje do końca treningu, z ograniczeniem do przedziału
0,5–1,5. Zejście z 9 na 2 km/h to nie prośba o czterokrotnie wolniejszy plan,
tylko potrzeba złapania oddechu.

Skala jest widoczna na ekranie treningu jako „+19% planu", trafia do
podsumowania i do historii. Można ją wyłączyć w Ustawieniach.

Sprawdzone na prawdziwym treningu: 1800 sekund zapisu z 14 września
przepuszczone przez detektor daje **zero** fałszywych wykryć.

## Zapis techniczny treningu

Każdy trening jest rejestrowany: komendy wysłane do bieżni, jej odpowiedzi,
przejścia odcinków, ostrzeżenia, rozłączenia oraz pomiary raz na sekundę
(prędkość faktyczna i docelowa, dystans, kalorie, tętno, odcinek).

Rejestrator jest czystym obserwatorem — podłącza się do zdarzeń, które bieżnia
i silnik już emitują, więc nie może zepsuć samego treningu. Pomiary bierze
z taktów silnika, nie ze zdarzeń BLE, dzięki czemu zapis powstaje także
w trybie prowadzenia, gdy nic nie jest połączone.

Eksport: przycisk w podsumowaniu treningu albo karta w zakładce Historia.
Plik zawiera nagłówek, strumień zdarzeń i tabelę pomiarów w CSV. Czas jest
podawany dwiema osiami: od naciśnięcia Start i od chwili, gdy pas faktycznie
ruszył — różnica między nimi to odliczanie konsoli bieżni.

Przechowywane są trzy ostatnie treningi. Jeśli localStorage się zapełni,
najstarszy zapis jest odrzucany, żeby nie zablokować zapisywania historii.

## Wersjonowanie

Numer wersji jest widoczny obok nazwy aplikacji w pasku górnym. Dotknięcie go
otwiera historię zmian; ten sam widok jest dostępny z zakładki Profil.

Jedynym źródłem prawdy jest [`js/version.js`](js/version.js) — stąd numer
bierze nagłówek, historia zmian, nazwa pamięci podręcznej service workera
oraz nagłówki raportu diagnostycznego i zapisu treningu. Przy analizie logu
zawsze więc wiadomo, która wersja go wyprodukowała.

Podnosząc wersję: zmień `VERSION` i dopisz wpis na początku `CHANGELOG`.
Nic więcej — nazwa pamięci podręcznej wyliczy się sama, więc nowa wersja
zastąpi starą bez ręcznego czyszczenia. Service worker jest rejestrowany jako
moduł (`type: 'module'`), żeby mógł zaimportować numer wersji; sprawdzone, że
Chrome przyjmuje taką zmianę typu nad już aktywnym workerem klasycznym.

Po aktualizacji aplikacja pokazuje powiadomienie z numerem nowej wersji —
bez tego, przy samoczynnej aktualizacji w tle, nie byłoby skąd wiedzieć,
że coś się zmieniło.

## Znane ograniczenia

- Brak obsługi iOS i Firefoksa — Web Bluetooth tam nie istnieje.
- Opcode'y protokołu własnościowego wymagają potwierdzenia na konkretnym
  urządzeniu; do tego czasu przy takiej bieżni działa tylko tryb prowadzenia.
- Pasy tętna łączą się tylko przez samą bieżnię; osobne parowanie czujnika
  nie jest jeszcze zaimplementowane.
- Historia trzyma pełne próbki tylko dla dziesięciu ostatnich treningów —
  reszta zostaje w formie podsumowań, żeby nie zapchać pamięci przeglądarki.
