<p>
  <a href="https://mcas.uos.ac.kr"><img src="assets/mcaslab.png" alt="MCAS Lab" height="34"></a>
  &nbsp;&nbsp;
  <a href="https://www.uos.ac.kr"><img src="assets/uos.png" alt="University of Seoul" height="20"></a>
</p>

# PMIC Census

ISSCC, VLSI, JSSC, CICC, ESSCIRC/ESSERC, A-SSCC, SSC-L, TCAS-I/II, TVLSI에 실린 전원관리 IC 논문(스위칭 DC-DC 변환기, PMIC·PMU, 배터리 충전기, 에너지 하베스팅 전원부)을 모아 보여주는 사이트입니다. MCAS Lab(서울시립대학교 첨단융합학부)에서 운영합니다. 자매 사이트: [ADC Census](https://mixedcas-lab.github.io/adc-census/), [PLL Census](https://mixedcas-lab.github.io/pll-census/), [LDO Census](https://mixedcas-lab.github.io/ldo-census/).

- 사이트: https://mixedcas-lab.github.io/pmic-census/
- 데이터 출처: IEEE Xplore API (서지 메타데이터와 링크만 공개, 초록·본문은 올리지 않음)

## 동작 방식

1. **데이터**: adc-census 수집기가 같은 학회·저널의 전체 논문을 랩 서버 캐시(`~/adc-census/cache/raw`)에 받아 둡니다. 이 저장소는 그 캐시를 읽기만 하므로 IEEE API를 따로 쓰지 않습니다. IEEE Access는 adc-census가 변환기 논문만 받기 때문에 제외했습니다.
2. **분류**: 제목에 DC-DC, buck/boost, switched-capacitor, hybrid converter, PMIC/PMU, charger, energy harvesting, 48V-to-1V 등이 있으면 core입니다. 3상·계통·모터 같은 시스템 규모 전력전자와 LDO 단독 논문(→ LDO Census)은 제외하고, SoC·센서 노드 안의 변환기나 초록에서만 언급한 논문은 related로 두고 수치를 표시하지 않습니다.
3. **유형·태그**: Inductive / Switched-capacitor / Hybrid / System(PMIC·충전기·하베스터), 구조(Buck, Boost, Buck-boost, Multi-level, Series-capacitor, SIMO, Multiphase, Resonant, SC topology, GaN/high-V, Integrated magnetics, Hysteretic/COT, Digital control), 응용(Processor/SoC, Data center/48 V, Battery/charger, IoT/harvesting, Display/LED, Automotive, Wireless power, Biomedical, Mobile).
4. **수치**: 제목·초록에서 V<sub>IN</sub>→V<sub>OUT</sub>, 최대 출력전류, 출력 전력, 피크 효율, 스위칭 주파수, 인덕턴스, 전력·전류 밀도, 정지전류, 리플, 부하 과도 droop, 공정, 면적을 정규식으로 뽑습니다.
5. **공개**: cron이 매일 06:57(adc-census 06:17 갱신 뒤) 재생성하고, 바뀐 것이 있으면 커밋·push합니다. adc-census가 매달 15일에 새 논문을 받으므로 사이트도 그때 늘어납니다.

## 그래프

Chart 메뉴: 효율 vs. 최대 출력전류, 효율 vs. 변환비(V<sub>OUT</sub>/V<sub>IN</sub>), 효율 vs. 스위칭 주파수, 전력밀도 vs. 효율, 손실(100 − 피크 효율) 연도별 추세, Custom.

## 수치 수정 요청

각 논문 아래 **Report a fix**를 누르면 논문 id, 현재 값, annotations.csv 행 형식이 채워진 GitHub 이슈가 열립니다. 연구실은 확인해 `data/annotations.csv`에 반영합니다.

| 열 | 내용 |
|---|---|
| `id` | IEEE article number (Xplore 주소 끝의 숫자) |
| `exclude` | `1`이면 목록에서 제외 |
| `type` | `Inductive`, `Switched-capacitor`, `Hybrid`, `System` |
| `arch`, `app` | 여러 개면 `;`로 구분 (예: `Buck;Multi-level`) |
| `vin`, `vout`, `ripple`, `dv` | V |
| `iout`, `iq` | A (`1.2`, `500m`, `10u`) |
| `pout`, `eff`, `fsw`, `ind` | W, %, Hz (`70M`), H (`4.7n`) |
| `pd`, `cd` | W/mm², A/mm² |
| `node`, `area`, `cal`, `note`, `by` | nm, mm², 보정 여부, 메모, 검수자 (`by`에 AI 도구 이름이면 AI 추출로 표시) |

빈칸은 자동 값을 유지하고, `-`나 `NA`는 값을 지웁니다.

## 참고

- IEEE Xplore API 이용약관을 따릅니다. 초록과 본문은 공개하지 않고, 서지 정보와 Xplore 링크만 제공합니다.
- 피크 효율과 밀도는 동작 조건과 손실 포함 범위(인덕터, 게이트 구동, 외부 부품)에 따라 크게 달라집니다. 인용·비교 전에 원문을 확인하세요.
