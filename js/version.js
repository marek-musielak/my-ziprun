// Jedno źródło prawdy o wersji aplikacji.
//
// Stąd bierze ją nagłówek, historia zmian, nazwa pamięci podręcznej service
// workera oraz nagłówki raportów diagnostycznych i zapisów treningu. Dzięki
// temu przy analizie logu zawsze wiadomo, która wersja go wyprodukowała.
//
// Podnosząc wersję, dopisz wpis na początku CHANGELOG — kolejność malejąca.
//
// ZASADA: każda zmiana widoczna dla użytkownika podnosi numer. Bez wyjątków
// typu "to jeszcze nie jest wypchnięte, więc dopiszę do poprzedniej wersji" —
// taki wyjątek raz już doprowadził do sześciu commitów pod jednym numerem.

export const VERSION = '1.16.1';

export const CHANGELOG = [
  {
    version: '1.16.1',
    date: '2026-09-29',
    title: 'Porządki w kodzie interfejsu',
    changes: [
      'Główny plik aplikacji, ponad 1300 linii, rozdzielony na moduły — po jednym na każdy widok. Działanie aplikacji się nie zmienia.',
      'Nowy numer jest potrzebny, żeby telefon pobrał nowy zestaw plików w całości, a nie połowę starego i połowę nowego.',
    ],
  },
  {
    version: '1.16.0',
    date: '2026-09-29',
    title: 'Rozgrzewka lżejsza od samego treningu',
    changes: [
      'Generator dawał rozgrzewce i schłodzeniu zawsze tempo marszu. W planie marszowym oznaczało to rozgrzewkę w tempie samego treningu — sześć minut „rozgrzewki” szło dokładnie tak, jak potem cały trening.',
      'Tempo ram wynika teraz z rdzenia: szczebel niżej niż najlżejszy odcinek treningu właściwego, ale nigdy wyżej niż marsz. Przed biegiem rozgrzewką zostaje marsz, przed marszem — spacer.',
      'Plany zapisane wcześniej poprawiają się same przy pierwszym wczytaniu. Odcinki właściwe i czasy zostają nietknięte.',
    ],
  },
  {
    version: '1.15.3',
    date: '2026-09-23',
    title: 'Zapis czeka na potwierdzenie z bieżni',
    changes: [
      'Rejestrator czeka teraz nie tylko na zatrzymanie pasa, ale i na ramkę, którą bieżnia potwierdza zatrzymanie — do trzech sekund. Wcześniej trafiała do zapisu raz na dwa razy, bo przychodzi dokładnie na granicy poprzedniego zapasu.',
      'Przycisk pobrania zapisu i tak czekał na domknięcie rejestratora, więc jedyną zmianą dla Ciebie są najwyżej trzy sekundy z napisem „Czekam, aż pas stanie…”.',
      'W trybie prowadzenia, bez połączonej bieżni, nie ma na co czekać — zapis domyka się od razu.',
    ],
  },
  {
    version: '1.15.2',
    date: '2026-09-23',
    title: 'Ostrzeżenie o bieżni nadąża za połączeniem',
    changes: [
      'Napis „Bieżnia nie jest połączona” zostawał na ekranie planu po połączeniu bieżni — liczył się stan z chwili otwarcia planu, a nie obecny. Ostrzeżenia odświeżają się teraz przy każdej zmianie połączenia.',
    ],
  },
  {
    version: '1.15.1',
    date: '2026-09-22',
    title: 'Odliczanie znowu białe',
    changes: [
      'Cyfra odliczania w pierścieniu przestała zmieniać kolor na pomarańczowy i zielony. Najważniejsza liczba na ekranie ma wyglądać tak samo przez cały trening, a rodzaj nadchodzącego odcinka i tak jest napisany pod spodem.',
    ],
  },
  {
    version: '1.15.0',
    date: '2026-09-21',
    title: 'Odliczanie do zmiany tempa w pierścieniu',
    changes: [
      'Przez ostatnie pięć sekund odcinka środek pierścienia odlicza 5, 4, 3, 2, 1 zamiast pokazywać czas. Pod cyfrą stoi nazwa i prędkość odcinka, który nadchodzi.',
      'Cyfra ma kolor nadchodzącego odcinka — zielona, gdy idzie przerwa, pomarańczowa, gdy praca. Widać to, zanim zdążysz przeczytać podpis.',
      'Napis „Rozpędzam do…” zniknął: pole pod prędkością wróciło do jednej roli i mówi po prostu, co będzie dalej.',
    ],
  },
  {
    version: '1.14.2',
    date: '2026-09-21',
    title: 'Większe napisy na dole ekranu treningu',
    changes: [
      'W pionowym trybie kompaktowym wiersz „Dalej” i przycisk „Zakończ trening” mają teraz 18 px zamiast 14 px i wyższe pola. Pod przyciskiem zostawało ponad sześćdziesiąt pikseli pustki.',
      'Wiersz z dystansem i kaloriami przestał się łamać w środku pary „zostało 11:42”. Każda liczba z podpisem zawija się teraz w całości.',
      'Tryb pełny i układ poziomy zostają bez zmian — tam miejsca nie ma.',
    ],
  },
  {
    version: '1.14.1',
    date: '2026-09-21',
    title: 'Pobrany zapis czeka na koniec hamowania',
    changes: [
      'Pobranie zapisu technicznego z ekranu podsumowania dawało plik urwany w połowie hamowania — bez potwierdzenia, że bieżnia stanęła. Teraz przycisk czeka, aż rejestrator się domknie, i mówi o tym napisem.',
      'Plik zapisu kończy się znakiem nowej linii.',
    ],
  },
  {
    version: '1.14.0',
    date: '2026-09-18',
    title: 'Kształt planu i kolor odcinka',
    changes: [
      'Karta planu na liście pokazuje miniaturę profilu prędkości. Jeden długi blok, falę albo gęste serie widać teraz rzutem oka, bez wchodzenia w szczegóły.',
      'Na ekranie treningu za pierścieniem świeci poświata w kolorze bieżącego odcinka — pomarańczowa przy pracy, zielona przy przerwie. Nagłówek odcinka ma ten sam kolor.',
      'Obie zmiany to rysunek i CSS: aplikacja nie przybrała ani jednego pliku graficznego.',
    ],
  },
  {
    version: '1.13.0',
    date: '2026-09-18',
    title: 'Ulubione plany',
    changes: [
      'Przycisk „☆ Ulubiony” w szczegółach planu. Ulubione trafiają na górę listy niezależnie od filtra i mają własny filtr „★ Ulubione”.',
      'Gwiazdka na karcie planu pokazuje, co jest oznaczone, bez wchodzenia w szczegóły.',
      'Ulubione wchodzą do kopii danych i scalają się przy imporcie — import z drugiego telefonu niczego nie odznacza.',
      'Pastylki filtrów przestały łamać się na dwie linie; cały pasek jest przez to niższy.',
    ],
  },
  {
    version: '1.12.1',
    date: '2026-09-18',
    title: 'Koniec z „Przerwą” w środku biegu',
    changes: [
      'Generator oznaczał wolniejszy z dwóch biegów jako przerwę, więc ekran treningu pisał „Przerwa” w trakcie czterominutowego biegu na ósemce. Przerwa to teraz tylko prawdziwa przerwa między seriami w interwałach.',
      'Udział pracy w podglądzie kreatora pokazywał przez to 27% tam, gdzie pracą jest cały rdzeń treningu. Spalanie tłuszczu 30 min ma 68%.',
      'Plany zapisane wcześniej poprawiają się same przy pierwszym wczytaniu — nie trzeba ich układać od nowa.',
    ],
  },
  {
    version: '1.12.0',
    date: '2026-09-16',
    title: 'Generator własnych planów',
    changes: [
      'Nowy przycisk „Ułóż własny plan” nad listą. Podajesz długość, rodzaj treningu i intensywność — generator dobiera rozgrzewkę, liczbę serii i długości odcinków.',
      'Pięć rodzajów: spalanie tłuszczu, interwały, wytrzymałość, narastający oraz marsz i regeneracja. Do tego trzy poziomy intensywności.',
      'Podgląd przelicza się na bieżąco: czas, dystans, udział pracy, wykres profilu i pełna lista odcinków — widać plan przed zapisaniem.',
      'Prędkości zapisują się jako poziomy wysiłku, tak jak w planach wbudowanych, więc własny plan skaluje się razem z profilem.',
      'Własne plany mają na liście odznakę „mój” i swój filtr, wchodzą do kopii danych i wracają z importu. Każdy można usunąć — historia odbytych treningów zostaje.',
    ],
  },
  {
    version: '1.11.1',
    date: '2026-09-16',
    title: 'Zapis techniczny mówi, co naprawdę zamówiono',
    changes: [
      'Wpis o rozpoczęciu odcinka pokazywał prędkość z planu także wtedy, gdy aplikacja zamówiła inną — po przejęciu tempa z panelu bieżni. Teraz pokazuje prędkość zadaną, a plan obok w nawiasie.',
    ],
  },
  {
    version: '1.11.0',
    date: '2026-09-15',
    title: 'Aplikacja podąża za panelem bieżni',
    changes: [
      'Zmiana prędkości na panelu bieżni zostaje przyjęta jako nowa skala całego planu: reszta odcinków przelicza się w tej samej proporcji. Wcześniej najbliższe przejście odcinka wracało do prędkości z planu.',
      'Skala widoczna na ekranie treningu („+19% planu”), zapisywana w historii i w zapisie technicznym.',
      'Korekta ograniczona do przedziału od połowy do półtorakrotności planu — zejście z 9 na 2 km/h to potrzeba złapania oddechu, a nie prośba o czterokrotnie wolniejszy trening.',
      'Przyjęcie prędkości nie wysyła bieżni żadnej komendy — pas zostaje tam, gdzie go ustawiłeś.',
      'Nową opcję „Podążaj za panelem bieżni” można wyłączyć w Ustawieniach.',
    ],
  },
  {
    version: '1.10.2',
    date: '2026-09-15',
    title: 'Wynik w nagłówku każdego zapisu technicznego',
    changes: [
      'Zapis pobrany z listy w Ustawieniach ma w nagłówku czas, dystans i informację, czy trening został ukończony. Wcześniej miał je tylko plik pobrany zaraz po treningu.',
    ],
  },
  {
    version: '1.10.1',
    date: '2026-09-13',
    title: 'Zegar zgodny z pasem, łuk odcinka rośnie',
    changes: [
      'Rozpędzanie pasa zaczyna się dokładnie tyle przed zmianą odcinka, ile potrwa sama zmiana. Wcześniej było to sześć sekund niezależnie od skoku, więc przy przejściu o 1 km/h bieżnia biegła już nową prędkością, a ekran przez kilka sekund pokazywał poprzedni odcinek.',
      'Czas zmiany wynika teraz z odstępu między komendami i wielkości skoku, a nie ze stałej w kodzie — zgadza się z pomiarami z bieżni co do sekundy.',
      'Pomarańczowy łuk bieżącego odcinka przyrasta w miarę jego trwania, zamiast się kurczyć. Idzie więc w tę samą stronę co zielony postęp całego treningu; liczba w środku nadal odlicza do zera.',
    ],
  },
  {
    version: '1.10.0',
    date: '2026-09-11',
    title: 'Kopia danych: eksport i import',
    changes: [
      'W Profilu przybyła sekcja „Kopia danych”. Eksport zapisuje plik z profilem, ustawieniami, całą historią treningów i trzema ostatnimi zapisami technicznymi.',
      'Import dopisuje treningi do istniejących zamiast je zastępować, a powtórki rozpoznaje po dacie i pomija — można więc scalić historię z dwóch telefonów.',
      'Profil i ustawienia wczytują się tylko po osobnym potwierdzeniu, bo zastąpienia prędkości w profilu nie da się cofnąć.',
      'Plik niebędący kopią ZipRun jest odrzucany z wyjaśnieniem, zamiast psuć dane.',
    ],
  },
  {
    version: '1.9.0',
    date: '2026-09-11',
    title: 'Historia ze szczegółami treningu',
    changes: [
      'Dotknięcie wpisu w historii rozwija szczegóły: średnia prędkość, tempo w min/km, prędkość maksymalna, kalorie, tętno, liczba przebiegniętych odcinków i użyta korekta prędkości.',
      'Miniatura przebiegu prędkości przy każdym treningu, dla którego zachowały się próbki.',
      'Porównanie z poprzednim biegiem tego samego planu — widać kierunek, a nie tylko stan.',
      'Przerwany trening pokazuje, jak daleko zaszedłeś: „38% planu”, „9 z 28 odcinków”. Wcześniej samo słowo „przerwany” nie mówiło, czy po minucie, czy po pół godzinie.',
      'Zapisywana jest też nazwa bieżni i informacja, czy trening prowadziło automatyczne sterowanie.',
    ],
  },
  {
    version: '1.8.0',
    date: '2026-09-11',
    title: 'Gest wstecz wraca do poprzedniego widoku',
    changes: [
      'Gest wstecz na telefonie zamykał aplikację zamiast cofać się o krok. Przełączanie widoków nie zapisywało się w historii przeglądarki, więc dla systemu istniał tylko jeden ekran.',
      'Każde przejście jest teraz osobnym wpisem: z Profilu wracasz do Historii, stamtąd do szczegółów planu i dalej do listy.',
      'Cofnięcie w trakcie treningu nie przerywa go — trening biegnie dalej, a gestem naprzód wracasz na jego ekran.',
      'Po zakończeniu treningu cofanie nie wraca już do jego pustego ekranu, tylko do listy planów.',
    ],
  },
  {
    version: '1.7.5',
    date: '2026-09-11',
    title: 'Większe liczby i znikający komunikat',
    changes: [
      'Komunikat z poprzedniego treningu zostawał na ekranie po rozpoczęciu nowego — „Trening zatrzymany.” tuż po starcie. Jest czyszczony przy starcie, a pojedynczy komunikat znika teraz sam po kilkunastu sekundach.',
      'Prędkość docelowa („cel 5,0 km/h”) zrównana rozmiarem z wierszem dystansu i kalorii — czyta się ją równie często.',
      'Dystans, kalorie i czas do końca powiększone o jedną czwartą.',
    ],
  },
  {
    version: '1.7.4',
    date: '2026-09-11',
    title: 'Pierścień z podziałem na odcinki',
    changes: [
      'Zewnętrzny pierścień postępu jest teraz grubszy i rozbity na łuki odpowiadające odcinkom planu. Widać nie tylko ile treningu zostało, ale też z ilu kawałków składa się reszta i jak długi jest każdy z nich.',
      'W orientacji poziomej nazwa odcinka przeniosła się do prawej kolumny, gdzie było wolne miejsce.',
      'Zwolnione miejsce w lewej kolumnie dostał pierścień — urósł z 252 do 363 px, czyli o ponad połowę.',
    ],
  },
  {
    version: '1.7.3',
    date: '2026-09-11',
    title: 'Koniec z mieszanką plików z dwóch wydań',
    changes: [
      'Błąd „Cannot set properties of null” przy starcie treningu brał się z tego, że telefon miał część plików z jednego wydania, a część z drugiego.',
      'Pliki idą teraz zawsze z jednej pamięci podręcznej, wypełnianej przy instalacji w trybie wszystko-albo-nic i nazwanej numerem wersji. Wcześniej o źródle każdego pliku decydowało osobne żądanie, więc jedno nieudane pobranie mieszało wydania.',
      'Aplikacja sprawdza teraz na starcie, czy pliki do siebie pasują, i sama proponuje pobranie od nowa, zamiast wywalać się dopiero w trakcie treningu.',
    ],
  },
  {
    version: '1.7.2',
    date: '2026-09-11',
    title: 'Aktualizacje docierają na telefon',
    changes: [
      'Podniesienie wersji nie wyzwalało wymiany plików w telefonie. Sam sw.js nie zmieniał się między wydaniami — zmieniał się tylko importowany numer wersji — a przeglądarka porównuje bajty sw.js i uznawała, że nie ma czego aktualizować.',
      'Numer wersji trafia teraz do adresu skryptu, więc każde wydanie jest wykrywane. Importy nie są już brane z pamięci HTTP przy sprawdzaniu aktualizacji.',
      'W Profilu, w sekcji „O aplikacji”, przybył przycisk „Pobierz aplikację od nowa” — czyści pamięć podręczną bez naruszania profilu, historii i zapisów technicznych.',
    ],
  },
  {
    version: '1.7.1',
    date: '2026-09-11',
    title: 'Kosmetyka ekranu treningu w poziomie',
    changes: [
      'Zniknął stały napis „Tryb prowadzenia — prędkość ustawiasz ręcznie”. Informacja pojawia się teraz raz, na starcie, jako powiadomienie.',
      'Dystans i kalorie wyraźnie powiększone — to liczby, na które zerka się w biegu.',
      'Prawa kolumna w orientacji poziomej scalona w jeden blok wyśrodkowany w pionie. Wcześniej jej wiersze rozciągała wysokość pierścienia obok i odstępy między nimi robiły się ogromne.',
      'Obie kolumny centrują się względem tego samego pasa, więc układ nie jest już przekrzywiony. Pierścienie powiększone.',
    ],
  },
  {
    version: '1.7.0',
    date: '2026-09-11',
    title: 'Tryb kompaktowy ekranu treningu',
    changes: [
      'Nowy domyślny wygląd treningu: duże odliczanie odcinka i duża prędkość, jeden wiersz z dystansem, kaloriami i czasem do końca. Bez przycisków sterowania — prędkość i zatrzymanie obsługujesz z panelu bieżni.',
      'Pierścień ma teraz dwa obwody: pomarańczowy odlicza bieżący odcinek, zielony wypełnia się postępem całego treningu. Zastępuje to osobny pasek postępu.',
      'Pełny panel z korektami ±0,5 km/h, pauzą i przeskokiem odcinka jest nadal dostępny: mała ikona w prawym górnym rogu ekranu treningu przełącza w obie strony, to samo ustawienie jest w Profilu.',
      'Nagłówek pokazuje numer odcinka, na przykład „odcinek 3 z 28”.',
      'Przycisk „Zakończ trening” zostaje w obu trybach — gdy zatrzymasz pas z konsoli, aplikacja wchodzi w pauzę i trzeba jej powiedzieć, że to koniec.',
    ],
  },
  {
    version: '1.6.0',
    date: '2026-09-11',
    title: 'Orientacja pozioma w trakcie treningu',
    changes: [
      'Aplikacja obraca się razem z telefonem — nie jest już zablokowana w pionie. Orientacja nie jest wymuszana: decydujesz, jak trzymasz telefon.',
      'Ekran treningu w poziomie przestawia się na dwie kolumny: pierścień odliczania po lewej, prędkość, liczby i sterowanie po prawej. Wszystko mieści się bez przewijania.',
      'W poziomie pasek górny i zakładki chowają się na czas treningu, żeby oddać miejsce — wracają po jego zakończeniu.',
      'Pozostałe widoki w poziomie działają jak dotąd.',
    ],
  },
  {
    version: '1.5.4',
    date: '2026-09-11',
    title: 'Poprawiony wykres w podsumowaniu',
    changes: [
      'Przebieg prędkości wychodził poza kartę i uciekał za krawędź ekranu. Półgodzinny trening dawał ponad tysiąc słupków, a mieści się ich około stu dwudziestu.',
      'Przy okazji wyszło, że silnik zbierał czterokrotnie za dużo próbek — po cztery na każdy pięciosekundowy odcinek, z powtórzonymi znacznikami czasu. Teraz jedna próbka co pięć sekund, zgodnie z zamysłem.',
      'Wykres uśrednia próbki do liczby słupków, która zmieści się w karcie, zachowując kształt przebiegu.',
    ],
  },
  {
    version: '1.5.3',
    date: '2026-09-11',
    title: 'Ekran nadąża za bieżnią',
    changes: [
      'Pas zmienia prędkość kilka sekund przed końcem odcinka, żeby interwał zaczynał się już na docelowym tempie — ale ekran o tym milczał i przez te sekundy pokazywał poprzedni etap.',
      'W trakcie zmiany pojawia się teraz wyraźny pasek „Rozpędzam do…” albo „Zwalniam do…” z odliczaniem do nowego odcinka.',
      'Prędkość docelowa pokazuje w tym czasie wartość, do której pas zmierza, zamiast celu kończącego się odcinka.',
      'Samo zachowanie bieżni bez zmian — wyprzedzenie jest celowe i korzystne dla treningu.',
    ],
  },
  {
    version: '1.5.2',
    date: '2026-09-11',
    title: 'Zapis obejmuje zatrzymanie pasa',
    changes: [
      'Zapis techniczny kończył się, zanim aplikacja zdążyła wysłać bieżni komendę zatrzymania — w logu z prawdziwego treningu ostatni pomiar pokazywał jadący pas, a potwierdzenia zatrzymania w ogóle nie było.',
      'Rejestrator jest teraz zamykany dopiero po wysłaniu komendy i czeka, aż pas faktycznie zwolni do zera — w zapisie widać całe hamowanie i potwierdzenie z bieżni.',
    ],
  },
  {
    version: '1.5.1',
    date: '2026-09-09',
    title: 'Sprzątanie profilu',
    changes: [
      'Usunięte pola „Wiek" i „Masa ciała". Wiek nie był używany do niczego, a masa tylko awaryjnie, gdy bieżnia nie raportuje kalorii — Twoja raportuje je sama. Formularz sugerował wpływ na trening, którego nie miał.',
      'Prędkości nigdy nie zależały od wieku ani wagi, tylko od trzech temp w profilu. Tak samo działa FitShow.',
      'Usunięte dwie nieużywane wartości w ustawieniach wewnętrznych.',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-09-09',
    title: 'Plan spalania tłuszczu z FitShow',
    changes: [
      'Nowy plan „Spalanie tłuszczu 30 min" — odtworzony co do sekundy z aplikacji FitShow: pięć bloków biegowych 8–9 km/h przeplatanych marszem.',
      'To jedyny plan z prędkościami wpisanymi wprost, a nie przeliczanymi z profilu. Korekta ±0,5 km/h w trakcie treningu działa na nim tak samo jak na pozostałych.',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-09-09',
    title: 'Wersjonowanie i historia zmian',
    changes: [
      'Numer wersji widoczny obok nazwy aplikacji — dotknięcie otwiera historię zmian.',
      'Nazwa pamięci podręcznej bierze się z numeru wersji, więc nowa wersja sama zastępuje starą.',
      'Powiadomienie po aktualizacji, z odnośnikiem do listy zmian.',
      'Numer wersji trafia do nagłówków raportu diagnostycznego i zapisu treningu.',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-09-09',
    title: 'Zapis techniczny treningu',
    changes: [
      'Każdy trening jest rejestrowany: komendy wysłane do bieżni, jej odpowiedzi, statusy, przejścia odcinków, ostrzeżenia i rozłączenia.',
      'Pomiary raz na sekundę: prędkość faktyczna i docelowa, dystans, kalorie, tętno, nazwa odcinka.',
      'Eksport do pliku tekstowego z podsumowania treningu albo z zakładki Historia. Tabela pomiarów w formacie CSV.',
      'Dwie osie czasu w pomiarach: od naciśnięcia Start i od chwili, gdy pas ruszył. Różnica między nimi to odliczanie konsoli bieżni.',
      'Przechowywane są trzy ostatnie treningi.',
      'Poprawka: komunikat o korekcie prędkości używał kropki dziesiętnej zamiast przecinka.',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-09-08',
    title: 'Zgodność z odliczaniem bieżni',
    changes: [
      'Po komendzie Start bieżnia odlicza kilka sekund na własnej konsoli. Zegar treningu rusza teraz dopiero, gdy pas faktycznie jedzie — wcześniej pierwszy odcinek tracił te sekundy, a zapowiedzi leciały do stojącego biegacza.',
      'Czas rozmowy z bieżnią i rozpędzania pasa nie jest już naliczany jako czas treningu.',
      'Bieżnia zeruje własny licznik dystansu po zatrzymaniu pasa. Dystans jest teraz sumą przyrostów, więc zatrzymanie pasa z konsoli w środku treningu nie kasuje całego przebiegu.',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-09-08',
    title: 'Dostosowanie do bieżni Zipro Newlite',
    changes: [
      'Diagnostyka wykazała brak sterowanej pochylni i zakres prędkości 1–12 km/h.',
      'Plany oparte na pochylni zastąpione odpowiednikami na płaskim: Marszobieg 40 min i Interwały progowe 5 × 5.',
      'Domyślny profil dopasowany do zakresu 1–12 km/h, żeby górne kotwice intensywności nie zlewały się w jedną wartość.',
      'Ekran treningu ukrywa kafelek nachylenia i przyciski ±1%, gdy bieżnia nie ma pochylni. W ich miejsce średnia prędkość.',
      'Poprawka: ostrzeżenie o braku pochylni nigdy się nie pokazywało, bo sprawdzało segmenty już przycięte do zera.',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-09-08',
    title: 'Pierwsza wersja',
    changes: [
      'Czternaście planów treningowych skalowanych z profilu użytkownika.',
      'Automatyczne sterowanie prędkością przez standard FTMS, ze stopniowym rampowaniem i zapowiedzią wyprzedzającą.',
      'Sterownik protokołów własnościowych ze snifferem ramek, dla bieżni bez FTMS.',
      'Diagnostyka GATT z eksportem raportu.',
      'Zapowiedzi głosowe po polsku, blokada wygaszania ekranu.',
      'Historia treningów, profil i ustawienia w pamięci telefonu.',
      'Działanie offline i instalacja na ekranie głównym.',
    ],
  },
];

export const currentEntry = () => CHANGELOG.find((e) => e.version === VERSION) ?? CHANGELOG[0];
