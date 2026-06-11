# Hot Wheels Filters Taxonomy

**Source:** HW Showcase iOS uygulaması, 2026-05-13 tarihli ekran görüntüleri.
**Scope:** Sadece `manufacturerSlug = 'hot-wheels'` olan ürünler/listelemeler için ek filtre + form alanları.
**Kural:** Mevcut Tarodan taxonomy'si (Scale, Year, Brand, CarModel, Material, Condition, vs.) **hiç etkilenmez**. HW olmayan ürünlerde bu liste hiç görünmez.

## Schema modeli

Mevcut tablolar kullanılır (`apps/api/prisma/schema.prisma:829-878`), tek değişiklik:

```prisma
model AttributeGroup {
  ...
  manufacturerSlug String?   // null = global; "hot-wheels" = HW-only
  @@index([manufacturerSlug])
}
```

Aşağıdaki 7 grup `manufacturerSlug = 'hot-wheels'` ile seed edilir.

## Toplam

| # | Grup slug | İsim | Değer sayısı |
|---|---|---|---|
| 1 | `hw-segment` | Segment | 8 |
| 2 | `hw-assortment` | Assortment (Seri) | 183 |
| 3 | `hw-body-color` | Body Color | 17 |
| 4 | `hw-color-finishes` | Color Finishes | 14 |
| 5 | `hw-rarity` | Rarity | 3 |
| 6 | `hw-designer` | Designer | 115 |
| 7 | `hw-wheel-type` | Wheel Type | 263 |
| | | **Toplam** | **603** |

Slug kuralı:
- Attribute group slug: `hw-{başlık}` (kebab-case).
- Attribute slug: kod öneki varsa o (örn. `5sp-bfg`); yoksa name'den kebab-case (örn. `treasure-hunt`).
- Tüm slug'lar lowercase, sadece `[a-z0-9-]`.

Display name = HW Showcase'de gösterilen tam string.

---

## 1. hw-segment (Segment) — 8

| Slug | Name |
|---|---|
| archives | Archives |
| events | Events |
| hot-wheels | Hot Wheels |
| licensed-entertainment | Licensed Entertainment |
| mattel-creations | Mattel Creations |
| premium | Premium |
| silver-series | Silver Series |
| themed-assortments | Themed Assortments |

---

## 2. hw-assortment (Assortment / Seri) — 183

| Slug | Name |
|---|---|
| 100-1-64 | 100% 1:64 |
| 100-preferred | 100% Preferred |
| 100-sets | 100% Sets |
| 100-showcase | 100% Showcase |
| 1-43 | 1:43 |
| 2-packs | 2-Packs |
| 30th-anniversary | 30th Anniversary |
| 5-packs | 5-Packs |
| 50th-anniversary-favorites | 50th Anniversary Favorites |
| 50th-anniversary-originals | 50th Anniversary Originals |
| acceleracers | AcceleRacers |
| action-machines | Action Machines |
| action-packs | Action Packs |
| american-classics-1-43 | American Classics 1:43 |
| anniversary | Anniversary |
| apptivity | Apptivity |
| auto-affinity | Auto Affinity |
| auto-milestones | Auto Milestones |
| auto-city | Auto-City |
| batman | Batman |
| battle-force-5 | Battle Force 5 |
| billionth-car-collection | Billionth Car Collection |
| bonus-car | Bonus Car |
| boulevard | Boulevard |
| bullrun | Bullrun |
| cap-blastin | Cap Blastin' |
| car-culture | Car Culture |
| cars-of-the-decades | Cars of the Decades |
| celebrations | Celebrations |
| character-cars | Character Cars |
| charawheels | Charawheels |
| classics | Classics |
| collaboration | Collaboration |
| collector-edition | Collector Edition |
| collectors-convention-australia | Collectors Convention (Australia) |
| collectors-convention-japan | Collectors Convention (Japan) |
| collectors-convention-malaysia | Collectors Convention (Malaysia) |
| collectors-convention-philippines | Collectors Convention (Philippines) |
| collectors-convention-usa | Collectors Convention (USA) |
| collectors-nationals-usa | Collectors Nationals (USA) |
| color-fx | Color FX |
| computer-cars | Computer Cars |
| connect-cars | Connect Cars |
| convention-brazil | Convention (Brazil) |
| convention-mexico | Convention (Mexico) |
| convertables | Convertables |
| cool-classics | Cool Classics |
| cool-collectibles | Cool Collectibles |
| cool-collectibles-sets | Cool Collectibles Sets |
| cop-rods | Cop Rods |
| crack-ups | Crack-Ups |
| crashers | Crashers |
| cruisin-america | Cruisin' America |
| custom-car-show-japan | Custom Car Show (Japan) |
| customs | Customs |
| cyber-racers | Cyber Racers |
| dale-jrs-picks | Dale Jr.'s Picks |
| delivery | Delivery |
| demolition-man | Demolition Man |
| display-case | Display Case |
| dragstrip-demons | Dragstrip Demons |
| dream-halloween | Dream Halloween |
| editors-choice | Editor's Choice |
| elite-64 | Elite 64 |
| entertainment | Entertainment |
| entertainment-2-packs | Entertainment 2-Packs |
| extreme-shoxx | Extreme Shoxx |
| fx-stunt-team | F/X Stunt Team |
| farbs | Farbs |
| fast-and-furious | Fast & Furious |
| ferrari-racer | Ferrari Racer |
| fire-rods | Fire Rods |
| flip-outs | Flip Outs |
| formula-1 | Formula 1 |
| garage | Garage |
| ghostbusters | Ghostbusters |
| gold-edition | Gold Edition |
| hall-of-fame | Hall of Fame |
| heritage | Heritage |
| high-speed-racing-wheels | High Speed Racing Wheels |
| highway-35-world-race | Highway 35 World Race |
| holiday-cars | Holiday Cars |
| holiday-rods | Holiday Rods |
| hot-line | Hot Line |
| hot-shots | Hot Shots |
| hot-wheels-factory | Hot Wheels Factory |
| hot-wheels-xl | Hot Wheels XL |
| hw-road-trippin | HW Road Trippin' |
| hwc | HWC |
| id | ID |
| indonesian-diecast-expo | Indonesian Diecast Expo |
| international-exclusives | International Exclusives |
| izod-indycar-series | IZOD IndyCar Series |
| jetz | Jetz |
| jukebox | Jukebox |
| kalifornia-kustoms | Kalifornia Kustoms |
| legends | Legends |
| legends-tour | Legends Tour |
| light-speeders | Light Speeders |
| long-haulers | Long Haulers |
| mainline | Mainline |
| maniacs | Maniacs |
| mario-kart | Mario Kart |
| mattel-brick-shop | Mattel Brick Shop |
| megaforce | Megaforce |
| military-rods | Military Rods |
| mlb-team-promotions | MLB Team Promotions |
| modern-classics | Modern Classics |
| motor-city-classics | Motor City Classics |
| motorcycles | Motorcycles |
| multi-packs | Multi-Packs |
| mutant-machines | Mutant Machines |
| mystery-models | Mystery Models |
| neon-speeders | Neon Speeders |
| nft-virtual-garage | NFT Virtual Garage |
| nismo-festival-exclusive | NISMO Festival Exclusive |
| originals | Originals |
| pantone | Pantone |
| park-n-plates | Park 'N Plates |
| pavement-pounders | Pavement Pounders |
| planet-hot-wheels | Planet Hot Wheels |
| pop-culture | Pop Culture |
| power-command | Power Command |
| powerburst | Powerburst |
| pro-circuit | Pro Circuit |
| pro-racing | Pro Racing |
| promotional | Promotional |
| racerverse | Racerverse |
| racing | Racing |
| racing-kits | Racing Kits |
| racing-rigs | Racing Rigs |
| rapid-transit | Rapid Transit |
| real-riders | Real Riders |
| revealers | Revealers |
| revvers | Revvers |
| rims | Rims |
| rlc | RLC |
| road-wars | Road Wars |
| rumblers | Rumblers |
| san-diego-comic-con | San Diego Comic Con |
| scene-machines | Scene Machines |
| scorchers | Scorchers |
| seasonal | Seasonal |
| shift-kickers | Shift Kickers |
| since-68 | Since '68 |
| singapore-diecast-expo | Singapore Diecast Expo |
| sizzlers | Sizzlers |
| special-projects | Special Projects |
| special-release | Special Release |
| speed-chargers | Speed Chargers |
| speed-machines | Speed Machines |
| speed-racer | Speed Racer |
| speed-readerz | Speed Readerz |
| star-wars-carships | Star Wars Carships |
| stars-wars-starships | Stars Wars Starships |
| steering-rigs | Steering Rigs |
| street-show | Street Show |
| stretch-racers | Stretch Racers |
| super-california-custom | Super California Custom |
| superman | Superman |
| target-retro | Target Retro |
| tattoo-machines | Tattoo Machines |
| team-hot-wheels | Team Hot Wheels |
| themed-automotive | Themed Automotive |
| themed-entertainment | Themed Entertainment |
| themed-multi-packs | Themed Multi-Packs |
| themed-sets | Themed Sets |
| thunder-cycles | Thunder Cycles |
| top-speed | Top Speed |
| toy-fair | Toy Fair |
| track-and-play-sets | Track & Play Sets |
| truck-co | Truck Co. |
| truckin-transporters | Truckin' Transporters |
| turbo-glo | Turbo Glo |
| ultra-hots | Ultra Hots |
| vintage | Vintage |
| vintage-racing | Vintage Racing |
| vintage-racing-club | Vintage Racing Club |
| whips | Whips |
| wild-race-teams | Wild Race Teams |
| wwe | WWE |
| x-v-racers | X-V Racers |
| zamac-flames | ZAMAC Flames |

---

## 3. hw-body-color (Body Color) — 17

| Slug | Name |
|---|---|
| beige | Beige |
| black | Black |
| blue | Blue |
| brown | Brown |
| chrome | Chrome |
| gold | Gold |
| gray | Gray |
| green | Green |
| multi-color | Multi-Color |
| orange | Orange |
| pink | Pink |
| purple | Purple |
| red | Red |
| silver | Silver |
| unpainted | Unpainted |
| white | White |
| yellow | Yellow |

---

## 4. hw-color-finishes (Color Finishes) — 14

| Slug | Name |
|---|---|
| anodized | Anodized |
| chromed | Chromed |
| enamel | Enamel |
| flourescent | Flourescent |
| gloss | Gloss |
| matte | Matte |
| metalflake | Metalflake |
| pearlescent | Pearlescent |
| polished | Polished |
| satin | Satin |
| spectraflame | Spectraflame |
| spectrafrost | Spectrafrost |
| tinted | Tinted |
| translucent | Translucent |

Not: HW Showcase'de "Flourescent" yazıyor (Mattel'in yazımı, "Fluorescent" değil) — bilerek aynen aldık.

---

## 5. hw-rarity (Rarity) — 3

| Slug | Name |
|---|---|
| chase | chase |
| super-treasure-hunt | super treasure hunt |
| treasure-hunt | treasure hunt |

Not: HW Showcase'de küçük harfle yazılmış; aynen bıraktık.

---

## 6. hw-designer (Designer) — 115

| Slug | Name |
|---|---|
| abe-lugo | Abe Lugo |
| alec-tam | Alec Tam |
| alton-takeyasu | Alton Takeyasu |
| alvin-chan | Alvin Chan |
| arushi-garg | Arushi Garg |
| blake-allen | Blake Allen |
| bob-lovejoy | Bob Lovejoy |
| bob-rosas | Bob Rosas |
| brendon-vetuskey | Brendon Vetuskey |
| brian-hillner | Brian Hillner |
| bruce-baur | Bruce Baur |
| bryan-benedict | Bryan Benedict |
| bryan-zhao | Bryan Zhao |
| charlie-angulo | Charlie Angulo |
| chris-colangelo | Chris Colangelo |
| craig-callum | Craig Callum |
| craig-meaux | Craig Meaux |
| dale-earnhardt | Dale Earnhardt |
| daniel-arsham | Daniel Arsham |
| dave-ford | Dave Ford |
| dave-martis | Dave Martis |
| dave-root | Dave Root |
| dave-sheltman | Dave Sheltman |
| dave-weise | Dave Weise |
| dmitriy-shakhmatov | Dmitriy Shakhmatov |
| don-tognotti | Don Tognotti |
| dwayne-vance | Dwayne Vance |
| eligio-lee | Eligio Lee |
| eric-han | Eric Han |
| eric-ostendorff | Eric Ostendorff |
| eric-tscherne | Eric Tscherne |
| ethan-wood | Ethan Wood |
| felipe-massa | Felipe Massa |
| felix-holst | Felix Holst |
| fraser-campbell | Fraser Campbell |
| gary-saffer | Gary Saffer |
| gary-swisher | Gary Swisher |
| george-soulakis | George Soulakis |
| glenn-yu | Glenn Yu |
| greg-padginton | Greg Padginton |
| greg-salzillo | Greg Salzillo |
| harald-belker | Harald Belker |
| harry-bradley | Harry Bradley |
| howard-rees | Howard Rees |
| ira-gilford | Ira Gilford |
| jack-chen | Jack Chen |
| jason-hill | Jason Hill |
| jeff-allison | Jeff Allison |
| jimmy-liu | Jimmy Liu |
| jj-hwang | JJ Hwang |
| joe-woo | Joe Woo |
| john-olaughlin | John O'Laughlin |
| john-reale | John Reale |
| john-violette | John Violette |
| josh-henson | Josh Henson |
| julian-payne | Julian Payne |
| jun-imai | Jun imai |
| keith-hippely | Keith Hippely |
| kevin-cao | Kevin Cao |
| larry-wood | Larry Wood |
| lee-johnstone | Lee Johnstone |
| leeway-chang | Leeway Chang |
| lindsey-lee | Lindsey Lee |
| ludovico-ferro | Ludovico Ferro |
| luis-rodriguez | Luis Rodriguez |
| manson-cheung | Manson Cheung |
| marco-reus | Marco Reus |
| mario-godoy | Mario Godoy |
| mark-barthold | Mark Barthold |
| mark-jones | Mark Jones |
| matt-gabe | Matt Gabe |
| mauricio-bedolla | Mauricio Bedolla |
| michael-heralda | Michael Heralda |
| michael-kollins | Michael Kollins |
| miguel-lopez | Miguel Lopez |
| mike-finizza | Mike Finizza |
| mike-nuttall | Mike Nuttall |
| miles-nurnberger | Miles Nurnberger |
| miva-filoseta | Miva Filoseta |
| nathan-proch | Nathan Proch |
| neal-smith | Neal Smith |
| nigo | Nigo |
| oliver-eaton | Oliver Eaton |
| ollie-eaton | Ollie Eaton |
| omar-rehman | Omar Rehman |
| otto-kuhni | Otto Kuhni |
| paul-delorean | Paul DeLorean |
| paul-tam | Paul Tam |
| phedon-tsiknopoulos | Phedon Tsiknopoulos |
| phil-riehlman | Phil Riehlman |
| rick-jung | Rick Jung |
| riley-stair | Riley Stair |
| rob-matthes | Rob Matthes |
| ron-way | Ron Way |
| ronald-wong | Ronald Wong |
| ryu-asada | Ryu Asada |
| scott-tupper | Scott Tupper |
| sei-cho | Sei Cho |
| sergio-perez | Sergio Pérez |
| shawn-moghadam | Shawn Moghadam |
| sonny-fisher | Sonny Fisher |
| steve-crijns | Steve Crijns |
| steve-moran | Steve Moran |
| terry-choy | Terry Choy |
| thomas-gilbert | Thomas Gilbert |
| todd-gibbs | Todd Gibbs |
| tom-daniel | Tom Daniel |
| tony-hawk | Tony Hawk |
| tony-martino | Tony Martino |
| tyco | Tyco |
| tyler-charest | Tyler Charest |
| vince-christman | Vince Christman |
| wayne-halford | Wayne Halford |
| wayne-scott | Wayne Scott |
| york-bleyer | York Bleyer |

---

## 7. hw-wheel-type (Wheel Type) — 263

| Slug | Name |
|---|---|
| 10dot | 10DOT 10-Dot |
| 10sp | 10SP 10-Spoke |
| 10sp-e | 10SP-E 10-Spoke Exotic |
| 3sp | 3SP 3-Spoke |
| 50l | 50L 50th Anniversary Logo |
| 50s | 50S 50th Anniversary Style (no logo) |
| 5dot | 5DOT 5-Dot |
| 5hd | 5HD 5-Hole Disc |
| 5sp | 5SP 5-Spoke |
| 5sp-bfg | 5SP-BFG 5-Spoke w/ BF Goodrich |
| 5sp-gy | 5SP-GY 5-Spoke w/ Goodyear |
| 5sp-rl | 5SP-RL 5SP w/ Red Line |
| 5sp-wl | 5SP-WL 5-Spoke w/ White Line |
| 5sp-ww | 5SP-WW 5-Spoke w/ White Wall |
| 5y | 5Y 5Y |
| 6sp-or | 6-Spoke Offroad 6SP-OR |
| 6sp | 6SP 6-Spoke |
| 7sp | 7SP 7-Spoke |
| 7sp-gy | 7SP-GY 7-Spoke w/ Goodyear |
| 7sp-rl | 7SP-RL 7-Spoke w/ Red Line |
| 7sp-wl | 7SP-WL 7SP w/ White Line |
| 7sp-ww | 7SP-WW 7-Spoke w/ White Wall |
| 8sp | 8SP 8-Spoke |
| ac6 | AC6 AcceleRacers 6-Spoke |
| ad | AD Aero Disc |
| baja5 | BAJA5 Baja 5-Spoke |
| bling | BLING Blings |
| blor | BLOR Bead-Lock Off-Road |
| bttf-r | BTTF-R Back to the Future Rail |
| bw | BW Black Wall |
| bw-gy | BW-GY Black Wall w/ Goodyear |
| bw-rl | BW-RL Black Wall w/ Red Line |
| bw-ww | BW-WW Black Wall w/ White Wall |
| c5sp | C5SP Crashers 5-Spoke |
| c6sp | C6SP Crashers 6-Spoke |
| cast5 | CAST5 Cast 5-Spoke |
| cc-rr | CC-RR Custom Classics Real Riders |
| cm5 | CM5 Co-Mold 5-Spoke |
| cm6 | CM6 Co-Mold 6-Spoke |
| corgi-4 | CORGI-4 Corgi 4-Spoke |
| corgi-6 | CORGI-6 Corgi 6-Spoke |
| corgi-8dot | CORGI-8DOT Corgi 8-Dot |
| corgi-8star | CORGI-8STAR Corgi 8-Star |
| corgi-c | CORGI-C Corgi Construction |
| corgi-lb | CORGI-LB Corgi Pound |
| cr | CR Construction Rollers |
| cr5sp | CR5SP Cyber Racers 5-Spoke |
| ct | CT Construction |
| ct-8dot | CT-8DOT Construction 8-Dot |
| ct-r | CT-R Construction Roller |
| cts | CTS Construction Tire Type 2 |
| cw6 | CW6 Charawheels 6-Spoke |
| cwmc | CWMC Charawheels Motorcycle |
| dd8 | DD8 Deep Dish 8-Spoke |
| deep-dish-neo-classics-redline | Deep Dish Neo-Classics Redline |
| dish | DISH |
| dragster-wirespoke-wheel | Dragster Wirespoke Wheel |
| e5 | E5 Exotic 5-Spoke |
| esw | ESW Extreme Shoxx |
| exotic-10-spoke | Exotic 10-Spoke |
| f1-98 | F1-98 Formula 1 (1998) |
| fc3 | FC3 Fraser Campbell 3-Spoke |
| fc6 | FC6 Fraser Campbell 6-Spoke |
| fd | FD Fat Daddy |
| fte | FTE Faster Than Ever |
| fte2 | FTE2 Faster Than Ever 2 |
| gear | GEAR Gear |
| glw | GLW - Gold Lace Wheel |
| gt5sp | GT5SP Gran Toros 5-Spoke |
| hh | HH Hot Hobs |
| hl | HL Hot Line |
| ho-hot-ones | HO Hot Ones |
| ho-the-hot-ones | HO The Hot Ones |
| ho-wl | HO-WL The Hot Ones w/ White Line |
| hot-shots-wheel | Hot Shots Wheel |
| hs3 | HS3 High-Speed 3-Spoke |
| hsd | HSD High-Speed Disc |
| hsw | HSW High-Speed Wheel |
| hw50style | HW50STYLE |
| hwmt-5m | HWMT-5M Hot Wheels Monster Trucks 5-Spoke |
| hwmt-6sp | HWMT-6SP Hot Wheels Monster Trucks 6-Spoke |
| hwmt-8dot | HWMT-8DOT Hot Wheels Monster Trucks 8-Dot |
| hwmt-disc | HWMT-DISC Hot Wheels Monster Trucks Disc |
| id5 | ID5 Hot Wheels ID 5-Spoke |
| id7 | ID7 Hot Wheels ID 7-Spoke |
| j5 | J5 Japanese 5-Spoke |
| l4 | L4 Lipped 4-Spoke |
| lime5 | LIME5 Lime 5-Spoke |
| lw-wire-spoke | LW-Wire Spoke |
| mc-pr5 | MC-PR5 Motorcycle Philip Riehlman 5-Spoke |
| mc1 | MC1 Micro Caster 1 |
| mc3 | MC3 Motorcycle 3-Spoke |
| mc5 | MC5 Manson Cheung 5-Spoke |
| mc5m | MC5M Motorcycle 5-Spoke |
| mccr | MCCR Motorcycle Café Racer |
| mgw | MGW Micro Gear Wheel |
| mi5 | MI5 Micro 5-Spoke |
| mig | MIG Micro Gear |
| mj | MJ Monster Jam |
| mk-4 | MK-4 Mario Kart 4-Slot |
| mk4 | MK4 Mario Kart 4-Slot |
| mk4s | MK4S Mario Kart 4-Slot |
| mkd | MKD Mario Kart Disc |
| mkhub | MKHub Mario Kart Hub |
| mkstar | MKSTAR Mario Kart Star |
| mm5 | MM5 Modern Muscle 5-Spoke |
| multi | MULTI MULTIPLE WHEEL TYPES |
| mxv | MXV Motorized X-V Racers |
| nc-rl | NC-RL Neo-Classics w/ Red Line |
| nc-ww | NC-WW Neo-Classics w/ White Wall |
| new-fte | New FTE |
| new-off-road | New Off Road |
| ns6 | NS6 Neon Speeders 6-Spoke |
| oh5 | OH5 Open Hole 5-Spoke |
| one-off | ONE OFF One Off (unspecified) |
| or5sp | OR5SP Off-Road 5-Spoke |
| or6sp | OR6SP Off-Road 6-Spoke |
| or8sp | OR8SP Off-Road 8-Spoke |
| ormc | ORMC Off-Road Motorcycle |
| orsb | ORSB Off-Road Saw Blade |
| orst | ORST Off-Road Steelie |
| orsw6 | ORSW6 Off-Road Swirl 6 Spoke |
| p4 | P4 Plus 4-Spoke |
| pc5 | PC5 Pro Circuit 5-Spoke |
| pc6 | PC6 Pro Circuit 6-Spoke |
| pp-6dot | PP-6DOT Pavement Pounders 6-Dot |
| pp-6sp | PP-6SP Pavement Pounders 6-Spoke |
| pp-8pet | PP-8PET Pavement Pounders 8-Petal |
| pr10-gy | PR10-GY Pro Racing 10-Spoke w/ Goodyear |
| pr5 | PR5 Philip Riehlman 5-Spoke |
| ra6 | RA6 Ryu Asada 6-Spoke |
| rc | RC Race Car |
| real-riders-beadlock-10-spoke | Real Riders Beadlock 10-Spoke |
| real-riders-custom | Real Riders Custom |
| real-riders-custom-off-road | Real Riders Custom Off-Road |
| real-riders-fifteen52-outlaw | Real Riders Fifteen52 Outlaw |
| real-riders-off-road-10-spoke | Real Riders Off-Road 10-Spoke |
| real-riders-preferred-rrprf | Real Riders Preferred RRPrf |
| real-riders-sc | Real Riders S/C |
| rl | RL Red Lines |
| rl-d | RL-D Red Lines Dual |
| rl-dd | RL-DD Red Lines Deep Dish |
| rr | RR Real Riders Drag Dish |
| rr-10sp-or | RR-10SP-OR Real Riders 10-Spoke Off-Road |
| rr-10spm | RR-10SPM Real Riders 10-Spoke Modern |
| rr-4sl | RR-4SL Real Riders 4-Slot |
| rr-4sl-ww | RR-4SL-WW Real Riders 4-Slot w/ White Wall |
| rr-4sp | RR-4SP Real Riders 4-Spoke |
| rr-5dot | RR-5DOT Real Riders 5-Dot |
| rr-5sl | RR-5SL Real Riders 5-Slot |
| rr-5sl-rl | RR-5SL-RL Real Riders 5-Slot w/ Red Line |
| rr-5sp | RR-5SP Real Riders 5-Spoke |
| rr-5sp-gy | RR-5SP-GY Real Riders 5-Spoke w/ Goodyear |
| rr-5sp-mag | RR-5SP-MAG Real Riders 5-Spoke Mag |
| rr-5sp-mag-gy | RR-5SP-MAG-GY Real Riders 5-Spoke Mag Goodyear |
| rr-5sp-mag-rl | RR-5SP-MAG-RL Real Riders 5-Spoke Mag Red Line |
| rr-5sp-rl | RR-5SP-RL Real Riders 5-Spoke w/ Red Line |
| rr-5sp-wl | RR-5SP-WL Real Riders 5-Spoke w/ White Line |
| rr-5sp-ww | RR-5SP-WW Real Riders 5-Spoke w/ White Wall |
| rr-5spm | RR-5SPM Real Riders 5-Spoke Modern |
| rr-6sp | RR-6SP Real Riders 6-Spoke |
| rr-6spm | RR-6SPM Real Riders 6-Spoke Modern |
| rr-6spm-or | RR-6SPM-OR Real Riders 6-Spoke Modern Off-Road |
| rr-8dot | RR-8DOT Real Riders 8-Dot |
| rr-8ho | RR-8HO Real Riders 8-Hole |
| rr-8sp | RR-8SP Real Riders 8-Spoke |
| rr-8sp-rl | RR-8SP-RL Real Riders 8-Spoke w/ Red Line |
| rr-a | RR-A Real Riders Aero |
| rr-bling10 | RR-BLING10 Real Riders Blings 10-Spoke |
| rr-bling5 | RR-BLING5 Real Riders Blings 5-Spoke |
| rr-bling6 | RR-BLING6 Real Riders Blings 6-Spoke |
| rr-blingtd | RR-BLINGTD Real Riders Blings Tear Drop |
| rr-bng | RR-BNG Real Riders BNG |
| rr-c | RR-C Real Riders Cobra |
| rr-c-gy | RR-C-GY Real Riders Cobra w/ Goodyear |
| rr-c-rl | RR-C-RL Real Riders Cobra w/ Red Line |
| rr-c10 | RR-C10 Real Riders C-10 |
| rr-d7 | RR-D7 Real Riders Davin 7-Spoke |
| rr-dd | RR-DD Real Riders Deep Dish |
| rr-dd-gy | RR-DD-GY Real Riders Deep Dish w/ Goodyear |
| rr-dd-or | RR-DD-OR Real Riders Deep Dish Off-Road |
| rr-dd-rl | RR-DD-RL Real Riders Deep Dish w/ Red Line |
| rr-dd-wl | RR-DD-WL Real Riders Deep Dish w/ White Line |
| rr-dd-ww | RR-DD-WW Real Riders Deep Dish w/ White Wall |
| rr-dsd-12 | RR-DSD-12 Real Riders DSD 12-Spoke |
| rr-dsd-5 | RR-DSD-5 Real Riders DSD 5-Spoke |
| rr-dsd-ddd | RR-DSD-DDD Real Ridders DSD Deep Drag Dish |
| rr-dsd-s | RR-DSD-S Real Riders DSD Slick |
| rr-e | RR-E Real Riders Exotic |
| rr-euro | RR-EURO |
| rr-f1 | RR-F1 Real Riders F1 |
| rr-indy | RR-INDY Real Riders Indy |
| rr-lr | RR-LR Real Riders Low Rider |
| rr-lw5 | RR-LW5 Real Riders Larry Wood 5-Spoke |
| rr-lw5-rl | RR-LW5-RL Real Riders Larry Wood 5-Spoke Red Line |
| rr-lw5-wl | RR-LW5-WL Real Riders Larry Wood 5-Spoke White Line |
| rr-mc | RR-MC Real Riders Modern Concave |
| rr-mc5m | RR-MC5M Real Riders Motorcycle 5-Spoke |
| rr-md | RR-MD Real Riders Moon Disc |
| rr-or-8dot | RR-OR-8DOT Real Riders Off-Road 8-Dot |
| rr-or5 | RR-OR5 Real Riders Off-Road 5-Spoke |
| rr-outlaw | RR-OUTLAW Real Riders Outlaw |
| rr-pc | RR-PC Real Riders Power Command |
| rr-pr10-gy | RR-PR10-GY Real Riders Pro Racing 10-Spoke |
| rr-prf | RR-Prf Preferred Series Real Riders |
| rr-race | RR-RACE Real Riders Race |
| rr-s | RR-S Real Riders Steelie |
| rr-s-gy | RR-S-GY Real Riders Steelie w/ Goodyear |
| rr-ss5c | RR-SS5C Real Riders Street Show 5-Spoke C |
| rr-ss5o | RR-SS5O Real Riders Street Show 5-Spoke O |
| rr-t | RR-T Real Riders Turbine |
| rr-t-gy | RR-T-GY Real Riders Turbine w/ Goodyear |
| rr-t-or | RR-T-OR Real Riders Turbine Off-Road |
| rr-turbo | RR-TURBO Real Riders Turbomac |
| rr-wsp | RR-WSP Real Riders Wire-Spoke |
| rr10sp | RR10SP - Real-Rider 10 Spoke |
| rr6spm | RR6SPM Real Rider 6 Spoke Mag |
| rrice | RRICE Real Rider Italian Classic Exotic |
| rrppz | RRPPZ - Real Riders Pirelli P-Zero |
| rrps | RRPS - Real Riders Pro Strip |
| rrrumblers-wirespoke-wheel | RRRumblers Wirespoke Wheel |
| rrrwsp | RRRWSP RRRumblers Wire Spoke |
| rrsc | RRSC - Real Riders S/C |
| rs5 | RS5 Retro Slot 5-Spoke |
| rsw | RSW - Retro Slot Wheels |
| rt | RT Rapid Transit |
| rvd | RVD RacerVerse Disc |
| rvn5 | RVN5 RacerVerse Negative 5 |
| rvnd | RVND RacerVerse Negative Disc |
| rvor | RVOR RacerVerse Off-Road |
| rvs | RVS RacerVerse Sporty |
| rvt | RVT RacerVerse Tooned |
| rw | RW Road Wars |
| s5 | S5 Star 5-Spoke |
| sb | SB Saw Blade |
| sb-t | SB-T Saw Blade Transporter |
| sc | SC Speed Chargers |
| scpr5 | ScPR5 Screamin' Philip Riehlman 5-Spoke |
| scr5 | SCR5 Screamin' 5-Spoke |
| sk5dot | SK5DOT Shift Kickers 5-Dot |
| sk5sp | SK5SP Skinny 5-Spoke |
| sktrk | SKTRK Skateboard Truck |
| skull | SKULL Skull |
| split-10 | Split 10 |
| st8 | ST8 Steelie 8-Spoke |
| star | STAR Star |
| steamboat | STEAMBOAT |
| steelie-cap | Steelie Cap |
| stkrz | STKRZ Stockerz |
| street | STREET Street |
| tg5 | TG5 Turbo Glo 5-Spoke |
| tis | TiS TiS 5-Spoke |
| tmhk | TMHK Tomahawk |
| tran | TRAN Transporter |
| trap5 | TRAP5 Trapezoid 5-Spoke |
| tt5 | TT5 Torque-Thrust 5-Spoke |
| tur | TUR Turbo |
| tw | TW - Turbo Wheel |
| uh | UH Ultra Hots |
| wsp | WSP Wire-Spoke |
| wwim | WWIM Wire Wheel in Motion |
| xv5 | XV5 X-V Racers 5-Spoke |
| y5 | Y5 - Y 5-Spoke |

---

## Bilinçli Saklanan Anomaliler

Aşağıdaki noktalar HW Showcase'de **olduğu gibi var**, hata değil — uygulamanın taxonomy'sine sadık kalıyoruz:

1. **`hw-color-finishes`**: "Flourescent" yazımı (Mattel'in resmi yazımı; "Fluorescent" değil).
2. **`hw-rarity`**: 3 değer de küçük harf ("chase", "treasure hunt", "super treasure hunt").
3. **`hw-designer`**: "Oliver Eaton" + "Ollie Eaton" — iki ayrı kayıt; aynı kişinin iki yazımı (HW Showcase böyle ayırmış).
4. **`hw-designer`**: "Jun imai" — "imai" küçük harf (Mattel'in yazımı).
5. **`hw-wheel-type`**: "HO Hot Ones" + "HO The Hot Ones" — aynı HO öneki, farklı isim. Slug'larla ayrıştırıldı (`ho-hot-ones`, `ho-the-hot-ones`).
6. **`hw-wheel-type`**: "MK-4", "MK4", "MK4S" — üçü de "Mario Kart 4-Slot" görünüyor; HW Showcase'de bu üç farklı kayıt mevcut, ayrı slug ile tutuldu.
7. **`hw-wheel-type`**: "RR-DSD-DDD Real Ridders DSD Deep Drag Dish" — "Ridders" yazımı (Mattel'in tipo'su; "Riders" değil). Aynen bırakıldı.

Bu anomaliler implementasyon sırasında değiştirilmeyecek; ileride Mattel düzeltirse senkron edilebilir.
