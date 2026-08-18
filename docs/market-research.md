# KAJ Rajshahi Market Analysis

**Task:** P0-RES-03

**Status:** draft — owner review required

**Research date:** 2026-08-18

**Scope:** Rajshahi public-data and public-listing baseline; no private interviews or transactions

## Method and evidence rules

This document answers the nine market questions in `KAJ_BUILD_GUIDE.md` C3 using current public sources and a reproducible OpenStreetMap sample. It is evidence for planning, not proof of marketplace demand.

- A number is included only when a source or reproducible observation supports it.
- `Observed` means visible in a cited public dataset, directory, or listing on the research date. It does not mean independently audited.
- `Inference` means a conclusion drawn from one or more observations. Inferences are labelled and must be tested in P0-RES-04.
- `Unknown` means the public evidence does not answer the question. Unknown is never converted into zero.
- Institution counters and platform claims are recorded as claims by their publishers.
- Listing prices are asking prices, not completed-transaction prices, and must not become KAJ price hints. The product rule requiring at least 30 comparable completed jobs still applies.
- OpenStreetMap (OSM) counts are a mapped-establishment sample, not a municipal business census. Missing map data can materially undercount a category.

## Decision summary

Rajshahi City Corporation reports **553,288 residents**, a density of **5,693 people per km²**, and an **88.88% literacy rate** in the 2022 census. The named institutions expose a documented floor of more than **71,386 students** across the University of Rajshahi, RUET, Rajshahi College, Varendra University, and North Bengal International University; Rajshahi Medical College adds an annual MBBS intake of 200, while its total current enrolment is not published on the reviewed page.

The evidence supports testing three compact pilot clusters rather than launching citywide: the eastern university belt, the central commercial belt, and the western medical/residential belt. Public listings show fragmented hiring through local job boards, classifieds, tutor media, direct messages, and personal networks. Mobile and MFS access is broad nationally, but individual handset ownership and reliable internet access are materially lower than household access. KAJ should therefore remain Bangla-first, low-data, offline-tolerant, cash-first, and explicit about trust and payment status.

These are hypotheses for field validation. The document does not establish fill rate, willingness to pay, no-show rate, local cash-versus-MFS share, or willingness to hire a stranger.

## 1. Population and student population

### 1.1 City baseline

| Measure | Number | Evidence | Interpretation |
|---|---:|---|---|
| Rajshahi City Corporation population | 553,288 | [Rajshahi City Corporation city profile](https://erajshahi.portal.gov.bd/pages/static-pages/6922e12c933eb65569e2aaf0), citing the 2022 Population and Housing Census | The addressable pilot is a mid-sized, dense city rather than a national market. |
| Male / female / hijra residents | 284,818 / 268,423 / 47 | Same city profile | KAJ must not use a male-student-only acquisition model. |
| Population density | 5,693 people/km² | Same city profile | Short-distance matching is plausible, but travel time and road barriers still require validation. |
| Literacy rate | 88.88% | Same city profile | High city literacy does not remove the documented need for short Bangla copy and icon-supported flows. |
| Administrative footprint | 30 wards and 6 thanas | Same city profile | Pilot reporting should retain ward/thana fields even if discovery uses neighbourhood labels. |

### 1.2 Named student pools

| Institution / channel | Published number | Date or qualification | Evidence |
|---|---:|---|---|
| University of Rajshahi | 30,000+ students | Current site counter reviewed 2026-08-18 | [University of Rajshahi](https://www.ru.ac.bd/) |
| RUET | 6,150 students | Current site counter reviewed 2026-08-18 | [RUET](https://www.ruet.ac.bd/) |
| Rajshahi College | Approximately 26,000 students | Current `At a Glance` claim; another college report lists 22,381 excluding HSC, so 26,000 is retained as an approximate headline rather than a precise census | [Rajshahi College at a glance](https://rc.gov.bd/at-a-glance/) and [performance report](https://rc.gov.bd/performance-report/) |
| Rajshahi Medical College | 200 MBBS admissions per year | Annual intake, not total current enrolment | [Rajshahi Medical College](https://rmc.edu.bd/) |
| Varendra University | Approximately 8,000 students | Current institutional `At a Glance` claim | [Varendra University at a glance](https://vu.edu.bd/the-university/at-a-glance) |
| North Bengal International University | 1,236+ students | Approximate, July 2025 | [NBIU at a glance](https://nbiu.edu.bd/aboutus/at_a_glance.html) |
| Rajshahi coaching-centre directory | 18 centres, 401 tutors | Directory coverage, not a city census | [Rajshahi Education directory](https://www.rajshahieducation.com/) |

The documented institutional floor is **71,386+ students** before RMC's undisclosed total enrolment and before uncounted colleges, medical/nursing institutions, polytechnics, schools, and coaching students. It is a sum of publisher counters with different dates and definitions, not a synchronized census. It is still large enough to justify a student-supply hypothesis for tutoring, design, event, retail, and short-shift work.

## 2. Density map of target areas

Coordinates below are public map reference points, rounded to six decimals. They identify research centres, not service boundaries or exact user locations.

| Target area | Reference point | Cluster | Market role to test |
|---|---|---|---|
| RUET / Talaimari | 24.361722, 88.626882 | Eastern university belt | Engineering-student supply, food/retail demand, evening work. |
| Kazla | 24.362658, 88.633281 | Eastern university belt | RUET-adjacent commerce and transit. |
| Binodpur | 24.367644, 88.643669 | Eastern university belt | RU-facing student housing, food, tutoring, and retail. |
| Motihar | 24.370003, 88.637281 | Eastern university belt | University of Rajshahi campus and adjacent student market. |
| Shaheb Bazar | 24.364840, 88.600096 | Central commercial belt | Dense shops, restaurants, errands, and urgent helper demand. |
| Boalia | 24.366986, 88.588900 | Central commercial belt | Civic/commercial activity linking central and medical areas. |
| Hetem Khan | 24.372758, 88.591442 | Central commercial belt | Student/residential edge near the city centre. |
| Laxmipur | 24.373900, 88.582129 | Western medical/residential belt | Pharmacy, clinic, diagnostic, household, and attendant demand. |
| Court | 24.373316, 88.562634 | Western institutional belt | Court, public offices, and nearby Hi-Tech Park employment. |
| Uposhohor | 24.377740, 88.597400 | Northern residential edge | Household services, tutoring, and repeat work. |
| Padma Residential Area | 24.374233, 88.609725 | Residential / transit edge | Household services and station-adjacent commerce. |
| Katakhali | 24.368181, 88.676138 | Eastern peri-urban edge | Longer-distance boundary case; should not be mixed into the compact core without travel tests. |
| Novotheatre area | 24.368935, 88.571620 | Western leisure/institutional belt | Event, visitor, food, and temporary staffing demand. |

The city profile gives a total administrative density but not neighbourhood density. For the pilot, KAJ should use these named areas as user-recognizable labels while recording ward/thana and coordinates separately. Exact service radii must be based on observed travel times, not a claim that all city trips are short.

## 3. Three-zone business census sample

### 3.1 Reproducible observation

On 2026-08-18, the [ohsome API](https://api.ohsome.org/) was queried against OSM history current to **2026-07-27 09:00 UTC**. Each row uses a circular boundary around the reference point. Restaurant counts include `amenity=restaurant` and `amenity=fast_food`; retail includes `shop=*` excluding pharmacy/chemist; pharmacy includes pharmacy/chemist tags; diagnostics/clinics includes mapped laboratory or clinic tags; coaching includes mapped language school, music school, training, or educational-institution office tags.

| Sample zone | Centre and radius | Restaurants | Retail | Pharmacies | Diagnostics / clinics | Coaching / training |
|---|---|---:|---:|---:|---:|---:|
| Eastern university belt | Talaimari, 1.8 km | 21 | 35 | 6 | 1 | 3 |
| Central commercial belt | Shaheb Bazar, 1.2 km | 16 | 27 | 0 | 0 | 4 |
| Western medical/residential belt | Laxmipur, 1.2 km | 6 | 6 | 40 | 29 | 7 |

The pattern is directionally coherent: food/retail is visible in the university and central samples, while the Laxmipur sample is strongly health-service weighted. The zero pharmacy and clinic counts in the central OSM sample mean **not mapped under the selected tags**, not that no such businesses exist.

### 3.2 Field replacement required

Before Phase 0 owner review, a researcher should walk one fixed route in each zone at the same daypart and record storefront name, category, open/closed state, approximate staff count, and whether temporary hiring occurs. The OSM sample is reproducible public evidence for P0-RES-03, but it is not a substitute for the business observations and interviews required to size demand.

## 4. Current hiring behaviour: a Shaheb Bazar shop owner

Public evidence shows a fragmented flow rather than a standardized local shift marketplace:

1. **Immediate network first — inference to validate.** An owner likely asks current staff, relatives, neighbouring shops, or known workers because those channels provide identity and reputation without a formal platform.
2. **Post or forward a short ad.** Rajshahi-specific jobs appear on local boards and classifieds. A current Rajshahi floor-assistant listing advertises part-time/hourly options and a monthly range of ৳8,000–৳12,000; a current Rajpara food-cart listing advertises part-time work at ৳5,000–৳8,000. [RajshahiJobs listing](https://www.rajshahijobs.com/job/1510/) and [Bikroy Rajpara listing](https://bikroy.com/rajpara/part-time-and-weekend-jobs/part-time-job-BwBafqoIwjp1w6jI7NQ8kblA.html)
3. **Screen by phone/chat.** The reviewed classifieds route applicants to direct contact. There is no public evidence of standardized availability checks, two-sided reputation, contract confirmation, or no-show handling in this local flow.
4. **Agree time and pay privately.** The public listings do not disclose whether the final payment is cash, MFS, daily, or monthly.

The network-first sequence is an **inference**, not an interview finding. P0-RES-04 must ask at least six shops/restaurants for the last real urgent hire: who they contacted first, number of calls, elapsed time, pay, no-shows, and why they trusted the selected person.

## 5. Current earning behaviour: a RUET student

The strongest public local evidence is tutoring:

1. A student registers with or messages a tutor media/page, or responds to a direct listing.
2. The media matches institution, subjects, location, schedule, and guardian preference. A Rajshahi-facing tutor page explicitly recruits students from RU, RUET, RMC, and National University institutions and advertises a **60% one-time media charge from the first month's salary** after confirmation. [Home Tutor BD](https://www.schoolandcollegelistings.com/BD/Rajshahi/105962074579551/Home-Tutor-BD)
3. Rajshahi tuition listings are also visible on Caretutors, Bikroy, and local classified mirrors, making phone/chat and platform mediation parallel acquisition routes. [Caretutors Rajshahi example](https://caretutors.com/job/list?jobid=158452&page=99), [Bikroy Boalia example](https://bikroy.com/boalia/child-care-and-education-services/baasaay-yeye-praaibhett-pddaano-hy-ASTOVrY0SDKW7mqOYmh8GMwQ.html), [Uposhohor example](https://aamarmarket.com/listing/home-tuition-in-rajshahi/)
4. For design work, public directories show Rajshahi poster designers available through portfolio marketplaces, while Bangladesh gig listings sell individual poster packages. [Behance Rajshahi poster designers](https://www.behance.net/hire/poster-designers/bangladesh/rajshahi) and [Helper poster service](https://helperbd.com/service/i-will-design-eye-catching-modern-and-professional-poster-for-your-business-or-event/125)

Unknowns include how many RUET students currently earn through each route, time-to-first-job, fraud rate, unpaid work, travel distance, and whether study-compatible scheduling matters more than price. Those require student interviews and concierge transactions.

## 6. Price reality

These are public asking-price observations. The sample unit is a listing or a separately priced package visible on the research date. National comparators are labelled because Rajshahi public price coverage is thin.

| Category | Observed asking range | Sample | Evidence and limits |
|---|---:|---:|---|
| Home tutoring, Rajshahi | ৳3,000–৳5,000 per month | n=3 listings | Boalia ৳3,000; Uposhohor ৳3,000–৳3,500; Shiroil HSC subjects ৳5,000. [Bikroy](https://bikroy.com/boalia/child-care-and-education-services/baasaay-yeye-praaibhett-pddaano-hy-ASTOVrY0SDKW7mqOYmh8GMwQ.html), [AamarMarket](https://aamarmarket.com/listing/home-tuition-in-rajshahi/), [Caretutors](https://caretutors.com/job/list?jobid=158452&page=99) |
| Shop / food assistant, Rajshahi | ৳5,000–৳12,000 per month | n=2 listings | Part-time listings; shift hours and final contracted pay are incomplete. [Bikroy](https://bikroy.com/rajpara/part-time-and-weekend-jobs/part-time-job-BwBafqoIwjp1w6jI7NQ8kblA.html), [RajshahiJobs](https://www.rajshahijobs.com/job/1510/) |
| Electrician visit / small job, Bangladesh comparator | ৳200–৳500 | n=8 visible price points | Visit/small-work prices from Mistri, Q Service profiles, and ProGo's starting price. Availability and Rajshahi coverage vary. [Mistri](https://www.mistri.com.bd/portfolio-item/expert-electrician-services/), [Q Service](https://qservice.com.bd/?lang=en), [ProGo](https://www.progo.app/) |
| Basic cleaning, Bangladesh comparator | ৳249–৳1,000 | n=4 visible offers | Includes starting, per-day, and per-service offers; deep cleaning is a different scope. [ProGo](https://www.progo.app/) and [Bikroy cleaning services](https://bikroy.com/cleaning-services) |
| Single poster design, Bangladesh comparator | ৳600–৳2,500 | n=4 packages | Three Helper packages and one PixelPrimp single-poster package. No completed-sale evidence. [Helper](https://helperbd.com/service/i-will-design-eye-catching-modern-and-professional-poster-for-your-business-or-event/125), [PixelPrimp](https://www.pixelprimp.com/services/poster-banner-design) |
| Event photography, Bangladesh comparator | ৳5,000–৳15,000 per event/package | n=6 visible packages | Single-photographer and small-event packages; travel and Rajshahi availability may add cost. [Art Gallery packages](https://artgalleryevent.com/packages/) and [Sumon Photography](https://sumonphotography.com/booking/) |

No category has the 30 comparable completed Rajshahi jobs required for a KAJ price hint. P0-RES-04 should collect at least ten quotes per category with scope, duration, location, worker experience, travel, materials, negotiated price, and final paid price kept separate.

## 7. Payment reality and trust

### 7.1 What public data establishes

- Bangladesh Bank lists Rocket, bKash, and Nagad among regulated MFS services and permits domestic cash-in/out, P2P, P2B, and B2P flows. [Bangladesh Bank payment systems](https://www.bb.org.bd/en/index.php/financialsystems/paysystems)
- Bangladesh Bank's June 2026 table reports **256,966,517 MFS account records**, **2,083,522 agents**, **650,413 merchant accounts**, and **1,029,409 personal retail accounts**. These are account records, not unique people. [Bangladesh Bank MFS statistics](https://www.bb.org.bd/econdata/fin_digitalfstat/tab8.pdf)
- The same table warns that Nagad did not submit data from March 2025 through February 2026 and resumed in March 2026, so apparent jumps across that boundary must not be interpreted as organic market growth.
- Tutor media explicitly describes collecting its fee after the tutor receives the first month's salary, while Bikroy job listings warn applicants not to pay an employer for a job. These are evidence that payment timing and job-fee scams are salient trust concerns, not measures of prevalence.

### 7.2 What remains unknown in Rajshahi

There is no reviewed public dataset for the share of small local jobs paid in cash, bKash, Nagad, Rocket, or bank transfer; whether customers pay before or after completion; who absorbs cash-out charges; how often payment is late; or which evidence resolves a dispute. P0-RES-04 and the five concierge transactions must record these fields for every transaction.

**Product implication:** retain the documented cash-on-completion MVP and record the agreed amount and payment method. Do not claim escrow, hold funds, or rank one MFS provider before the legal/payment gate and real local evidence.

## 8. Connectivity and devices

| Measure | Current public evidence | Product implication |
|---|---|---|
| Household mobile access | 98.9% of Bangladeshi households had at least one mobile phone in the BBS 2025–26 Q1 survey | Phone-first is justified, but household access is not individual ownership. |
| Household smartphone access | 72.4% nationally; 80.8% in urban households | An Android app can reach much of the city, but smartphone-only onboarding can still exclude users. |
| Individual handset ownership | 56.5%; 80.6% used mobile phones | Shared-phone and changing-SIM scenarios remain relevant. |
| Individual internet use | 48.9%; 56.2% of households had at least one internet user | Do not require constant connectivity or large downloads. |
| Internet subscriptions | BTRC reported 115.04 million mobile and 14.62 million ISP/PSTN subscriptions in December 2025; its definition counts a subscription that accessed the internet within 90 days | Subscription totals are not unique users and do not prove active, reliable data at job time. |
| Coverage versus quality | GSMA reported 4G population coverage of 99% in 2025, while a Rajshahi University campus study found meaningful signal variation between networks and locations | Coverage maps do not remove the need for cached screens, queued writes, and idempotency. |

Sources: [BBS survey summary via Bangladesh Sangbad Sangstha](https://www.bssnews.net/news/343905), [BTRC internet subscribers](https://btrc.portal.gov.bd/pages/static-pages/6922e0a3933eb65569e27f59), [GSMA Bangladesh spectrum study summary](https://www.gsma.com/newsroom/press-release/high-spectrum-fees-risk-slowing-bangladeshs-digital-future-new-gsma-study-finds/), and [Rajshahi University campus signal study](https://www.researchgate.net/publication/369033425_Studying_and_Analyzing_the_Cellular_Network_Signal_Strength_Variations_for_GSM_Networks_in_a_University_Campus).

Public hearings in late 2025 included complaints about cost, service quality, and small-pack pricing. This supports treating data as budgeted, but it is not a representative usage survey. KAJ should preserve the existing 60 KB feed target, avoid autoplay media, compress uploads, show cached/live status, and allow safe retry without duplicate applications.

## 9. Seasonality

| Period | Evidence | Likely marketplace effect — inference to test |
|---|---|---|
| Exams and mid-semester recess | RUET publishes an academic calendar and program-specific examination/recess notices. Dates vary by cohort. [RUET academic calendar](https://www.ruet.ac.bd/page/academic-calendar) | Student availability may fall during exams and rise during some breaks; city supply may also leave Rajshahi during long vacations. Collect institution and availability without exposing it publicly by default. |
| Ramadan and Eid | Bangladesh's 2026 public-holiday schedule included multi-day Eid closures, and the 2026 school calendar was revised for a 36-day Ramadan-related closure. [Ministry of Public Administration holidays](https://mopa.gov.bd/pages/public-holiday?archived=true) and [BSS school-closure report](https://www.bssnews.net/news/362171) | Daytime food/retail patterns, evening demand, travel, and worker availability can shift sharply. Refresh dates annually because lunar dates move. |
| Wedding season | A current Bangladesh photography guide identifies October–February as peak booking season. [ChitroKuthir 2026 guide](https://chitrokuthir.com/nikah-photography-bangladesh/) | Temporary photography, decoration, catering, and event-helper demand may rise; vendor claims need Rajshahi booking evidence. |
| Monsoon | Bangladesh Meteorological Department analysis identifies June–October as Rajshahi's main extreme-rainfall period. [BMD climate report](https://www.bmd.gov.bd/file/2024/02/27/pdf/162368.pdf) | Travel time, outdoor work, cancellations, and connectivity risk increase. Matching should use time/distance buffers and clear cancellation communication. |
| Semester breaks | Institution calendars and notices are the authoritative source, but a single synchronized citywide break was not found | Do not hard-code a universal student calendar; allow weekly availability and temporary away/unavailable states. |

## 10. Field-validation instrument for P0-RES-04

The following measurements close the remaining evidence gaps without changing P0-RES-04's required sample:

1. Walk the three sample zones using fixed routes and count the five business categories with timestamped notes.
2. Ask six shops/restaurants about their last urgent or temporary hire, including first channel, number of contacts, time-to-fill, pay basis, no-shows, and trust signal.
3. Ask twelve students about their last paid work search, including channel, fee, time-to-first-lead, study conflict, travel, non-payment, and willingness to use a new marketplace.
4. Obtain at least ten scoped quotes in each required price category; keep asking, agreed, and paid amounts separate.
5. For every concierge transaction, record agreed scope, address disclosure timing, attendance, start/end, final payment rail, fees/cash-out, disputes, and whether both sides would repeat.
6. Capture phone model/RAM, Android version, SIM/operator, typical data pack, shared-phone status, and observed network failure for interview participants only with consent.

## 11. Acceptance trace

| C3 requirement | Result | Evidence in this document |
|---|---|---|
| 1. Population and student population | PASS | City census figures and sourced numbers for RU, RUET, Rajshahi College, RMC intake, two private universities, and a coaching directory. |
| 2. Density map of named target areas | PASS | All required areas have a reference point, cluster, and testable market role. |
| 3. Three-zone business census sample | PASS WITH LIMITATION | Reproducible OSM/ohsome mapped-establishment counts; physical walk-count remains a field-validation action. |
| 4. Current shop hiring behaviour | PASS WITH INFERENCE | Public local listings establish channels and prices; network-first sequence is explicitly marked for interview validation. |
| 5. Current student earning behaviour | PASS WITH INFERENCE | Rajshahi tutor media/listings and design marketplaces establish visible routes; prevalence remains unknown. |
| 6. Price reality | PASS | Six required categories have ranges, sample sizes, units, links, and locality limits. |
| 7. Payment reality | PASS WITH LIMITATION | Current national MFS rails and scale are sourced; local method share and cash norms remain unknown for fieldwork. |
| 8. Connectivity and devices | PASS | Current BBS, BTRC, GSMA, and Rajshahi campus evidence with product implications. |
| 9. Seasonality | PASS | Academic, Ramadan/Eid, wedding, and Rajshahi monsoon evidence; inferred effects are labelled. |

## 12. Decisions and limitations

- Prioritize field testing in the eastern university, central commercial, and western medical/residential clusters; this is not approval to launch in all three.
- Treat Katakhali as a travel-boundary test rather than part of the compact initial core.
- Keep cash-on-completion as the MVP baseline and record MFS only as an external payment method until legal/provider gates are signed.
- Do not publish a price hint from these listings. Asking prices, historical rates, and completed prices are different datasets.
- Do not use the institutional student floor as a user-acquisition forecast or claim it in marketing.
- Do not interpret OSM zeroes as absence or OSM counts as business market share.
- No public evidence reviewed here can replace the 35 interviews and five concierge transactions required by P0-RES-04.
- Product code remains gated until all Phase 0 deliverables are complete and owner-reviewed.

## Source register

- [Rajshahi City Corporation city profile](https://erajshahi.portal.gov.bd/pages/static-pages/6922e12c933eb65569e2aaf0)
- [BBS Key Features of Rajshahi City Corporation, 2022](https://objectstorage.ap-dcc-gazipur-1.oraclecloud15.com/n/axvjbnqprylg/b/V2Ministry/o/office-bbs/2024/12/0f0e34c9a5714826bb76665c84396a50.pdf)
- [University of Rajshahi](https://www.ru.ac.bd/)
- [RUET](https://www.ruet.ac.bd/)
- [Rajshahi College at a glance](https://rc.gov.bd/at-a-glance/)
- [Rajshahi Medical College](https://rmc.edu.bd/)
- [Varendra University at a glance](https://vu.edu.bd/the-university/at-a-glance)
- [NBIU at a glance](https://nbiu.edu.bd/aboutus/at_a_glance.html)
- [Rajshahi Education directory](https://www.rajshahieducation.com/)
- [Nominatim](https://nominatim.openstreetmap.org/) and [ohsome API](https://api.ohsome.org/), © OpenStreetMap contributors
- [Bangladesh Hi-Tech Park Authority park information](https://ossbhtpa.gov.bd/park-info)
- [Rajshahi Novotheatre ticket portal](https://novo.spectrum.com.bd/home-ticket?organization_id=20)
- [Home Tutor BD](https://www.schoolandcollegelistings.com/BD/Rajshahi/105962074579551/Home-Tutor-BD)
- [Caretutors](https://caretutors.com/job/list?jobid=158452&page=99)
- [Bikroy](https://bikroy.com/)
- [RajshahiJobs](https://www.rajshahijobs.com/job/1510/)
- [Bangladesh Bank payment systems](https://www.bb.org.bd/en/index.php/financialsystems/paysystems)
- [Bangladesh Bank June 2026 MFS statistics](https://www.bb.org.bd/econdata/fin_digitalfstat/tab8.pdf)
- [BTRC internet subscribers](https://btrc.portal.gov.bd/pages/static-pages/6922e0a3933eb65569e27f59)
- [BBS ICT survey summary](https://www.bssnews.net/news/343905)
- [Bangladesh Meteorological Department climate report](https://www.bmd.gov.bd/file/2024/02/27/pdf/162368.pdf)

## Next task

`P0-RES-04 — Problem validation` requires owner-supplied field evidence from 20 worker-side interviews, 15 demand-side interviews, and five manually brokered concierge transactions. It remains blocked until that evidence exists.
