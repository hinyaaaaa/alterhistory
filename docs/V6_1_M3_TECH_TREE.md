# v6.1.0 M3: 統合技術ツリー（自動生成）

ノード 174・レーン 11・列 20。正本は `js/core/civ/techtree.js`。

## ◆ 素材・道具

| 技術 | 列 | 前提 | 成立の条件 | 解禁 | 効果 |
|---|---|---|---|---|---|
| 石器（`stone_tools`） | 0 | — | — | — | — |
| 火の利用（`fire_control`） | 1 | stone_tools | — | pop:cold | cap+0.04 |
| 縄・網（`cordage`） | 1 | stone_tools | — | — | cap+0.03 |
| 組み合わせ道具（`hafted_tools`） | 2 | stone_tools, fire_control | — | — | cap+0.04 |
| 皮なめし・衣服（`hide_working`） | 2 | fire_control | — | pop:cold | cap+0.05 |
| 土器（`pottery`） | 2 | fire_control | clay | storage:pottery | cap+0.04 |
| 織物（`weaving`） | 2 | cordage | — | — | cap+0.03 |
| 銅加工（`copper_working`） | 3 | pottery, fire_control | 規模300・cu_sn | — | — |
| 青銅（`bronze`） | 4 | copper_working, pottery | 規模400・cu_sn | unit:ranged | ind+0.1 |
| 鉄（`iron`） | 5 | bronze | 規模800・iron | — | ind+0.15 cap+0.05 |
| 送風・高炉（`bellows`） | 6 | iron | 規模1200 | — | ind+0.1 |
| ガラス（`glassmaking`） | 7 | pottery, bellows | — | — | — |
| 鋼（`steel`） | 7 | iron, bellows | 規模2000 | — | ind+0.15 |
| 精密工作（`precision_tools`） | 8 | steel, mathematics | 規模6000 | — | ind+0.12 |
| 化学（`chemistry`） | 9 | glassmaking, natural_philosophy | 規模8000 | — | ind+0.1 health+0.03 |

## ❀ 農業・牧畜

| 技術 | 列 | 前提 | 成立の条件 | 解禁 | 効果 |
|---|---|---|---|---|---|
| 採集の知識（`foraging_arts`） | 2 | stone_tools, fire_control | — | — | cap+0.04 |
| 漁撈（`fishing`） | 2 | cordage | water | subsist:fishing | cap+0.05 |
| 農耕（`agriculture`） | 3 | foraging_arts | fertile | subsist:agriculture, action:found_city | cap+0.2 |
| 牧畜（`pastoralism`） | 3 | foraging_arts | grass | subsist:pastoral | cap+0.1 |
| 保存食（`food_preservation`） | 3 | fire_control, foraging_arts | — | — | cap+0.04 |
| 騎乗（`horse_riding`） | 4 | pastoralism | 規模200 | unit:cavalry, pop:steppe | — |
| 灌漑（`irrigation`） | 5 | agriculture, construction | 定住 | — | cap+0.15 |
| 犂（`plow`） | 6 | irrigation, pastoralism | 定住 | — | cap+0.2 |
| 段々畑（`terracing`） | 7 | plow, masonry | — | — | cap+0.08 |
| 輪作（`crop_rotation`） | 8 | plow, terracing | 定住 | — | cap+0.25 |
| 品種改良（`selective_breeding`） | 9 | crop_rotation, natural_philosophy | — | — | cap+0.1 |
| 条播機（`seed_drill`） | 9 | crop_rotation, precision_tools | — | — | cap+0.1 |
| 化学肥料（`fertilizer`） | 10 | selective_breeding, chemistry | — | — | cap+0.3 |
| 農業機械化（`agri_mechanization`） | 12 | seed_drill, internal_combustion | — | — | cap+0.25 |

## ▣ 建築

| 技術 | 列 | 前提 | 成立の条件 | 解禁 | 効果 |
|---|---|---|---|---|---|
| 住居（`shelter`） | 3 | hafted_tools, hide_working | — | pop:cold | cap+0.03 |
| 建築（`construction`） | 4 | shelter | 規模300 | action:found_city | — |
| 石造（`masonry`） | 5 | construction | 規模600・stone | — | — |
| 煉瓦（`brick`） | 5 | pottery, construction | clay | — | cap+0.03 |
| 城壁（`fortification`） | 6 | masonry | 規模500 | action:build_fortification, unit:garrison | def+0.1 |
| 道路（`roads`） | 6 | construction, wheel | 規模1000 | trade:land_long | trade+0.08 |
| 水道橋（`aqueduct`） | 6 | masonry, irrigation | 規模4000 | — | cap+0.06 health+0.04 |
| 都市計画（`city_planning`） | 7 | roads, administration | 規模6000 | — | cap+0.05 tax+0.05 |
| コンクリート（`concrete`） | 10 | masonry, chemistry | — | — | — |
| 鉄骨構造（`structural_steel`） | 11 | steel, concrete, industry | — | — | cap+0.08 |

## ➤ 輸送・航海

| 技術 | 列 | 前提 | 成立の条件 | 解禁 | 効果 |
|---|---|---|---|---|---|
| 航海（`seafaring`） | 2 | cordage | 規模300・coast | move:sea, subsist:fishing | — |
| 車輪（`wheel`） | 5 | pottery, construction | 規模600 | — | — |
| 造船（`shipbuilding`） | 5 | seafaring, construction | coast | unit:navy | trade+0.05 |
| 荷車（`cart`） | 6 | wheel, pastoralism | — | — | trade+0.05 |
| 港湾（`harbor`） | 6 | shipbuilding, masonry | 規模3000・coast | trade:sea_long | trade+0.12 |
| 航法（`navigation`） | 8 | astronomy, shipbuilding | — | move:ocean | — |
| 外洋帆船（`ocean_sailing`） | 9 | navigation, harbor | — | — | trade+0.12 |
| 蒸気船（`steamship`） | 10 | steam_engine, shipbuilding | — | — | trade+0.15 |
| 鉄道（`railway`） | 10 | steam_engine, steel | — | trade:rail | trade+0.2 cap+0.05 |
| 自動車（`motor_vehicle`） | 12 | internal_combustion, roads | — | — | trade+0.1 |
| 航空（`aviation`） | 13 | internal_combustion, precision_tools, motor_vehicle | — | unit:air | — |
| 人工衛星（`satellites`） | 14 | ballistic_missile, computing | — | space:satellite | trade+0.05 |

## ∑ 数学・測量・天文

| 技術 | 列 | 前提 | 成立の条件 | 解禁 | 効果 |
|---|---|---|---|---|---|
| 計数（`counting`） | 2 | stone_tools | — | — | learn+0.05 |
| 暦（`calendar`） | 5 | record_keeping, counting | 定住 | — | — |
| 数学（`mathematics`） | 6 | writing, counting | — | — | learn+0.05 |
| 測量（`surveying`） | 7 | mathematics, construction | — | admin:land_survey | — |
| 天文（`astronomy`） | 7 | calendar, mathematics | — | — | — |
| 光学（`optics`） | 8 | glassmaking, mathematics | — | — | — |
| 自然哲学（`natural_philosophy`） | 8 | mathematics, writing, astronomy | 規模5000 | — | learn+0.05 |
| 実験科学（`scientific_method`） | 9 | natural_philosophy, printing | — | — | learn+0.15 |
| 微積分（`calculus`） | 9 | mathematics, natural_philosophy | — | — | — |
| 統計（`statistics`） | 10 | mathematics, bureaucracy, scientific_method | — | — | tax+0.04 |

## ✎ 記録・文字・通信

| 技術 | 列 | 前提 | 成立の条件 | 解禁 | 効果 |
|---|---|---|---|---|---|
| 口承（`oral_tradition`） | 1 | stone_tools | — | — | learn+0.06 |
| 記号（`symbol_marks`） | 3 | oral_tradition, counting | — | — | — |
| 記録（`record_keeping`） | 4 | pottery, symbol_marks | 規模800・定住 | admin:records | learn+0.05 |
| 文字（`writing`） | 5 | record_keeping | 規模1000・定住 | action:covert_op | learn+0.12 |
| 表音文字（`alphabet`） | 6 | writing | — | — | learn+0.1 |
| 紙（`papermaking`） | 6 | writing | 規模3000 | — | learn+0.1 |
| 駅伝・郵便（`postal_system`） | 7 | roads, writing, administration | — | admin:courier | — |
| 印刷（`printing`） | 7 | papermaking | 規模5000 | — | learn+0.2 |
| 新聞（`newspapers`） | 8 | printing, alphabet | — | — | learn+0.06 |
| 電信（`telegraph`） | 12 | electricity | — | — | — |
| 計算機（`computing`） | 12 | electricity, calculus, precision_tools | — | — | learn+0.15 ind+0.1 |
| 無線通信（`radio`） | 13 | telegraph, electric_grid | — | — | learn+0.1 trade+0.04 |
| 機械学習（`machine_learning`） | 13 | computing, statistics | — | — | learn+0.06 |

## ✚ 医療・衛生

| 技術 | 列 | 前提 | 成立の条件 | 解禁 | 効果 |
|---|---|---|---|---|---|
| 薬草（`herbalism`） | 3 | foraging_arts | — | — | health+0.03 |
| 外傷の手当（`bone_setting`） | 4 | herbalism, hafted_tools | — | — | health+0.03 |
| 医学（`medicine`） | 6 | herbalism, writing | — | — | health+0.05 |
| 公衆衛生の習慣（`hygiene_practice`） | 7 | medicine, aqueduct | 規模4000 | — | health+0.06 cap+0.03 |
| 検疫（`quarantine`） | 7 | medicine, harbor | — | — | health+0.04 |
| 衛生（`sanitation`） | 8 | medicine, hygiene_practice | 規模5000 | — | cap+0.1 health+0.08 |
| 解剖学（`anatomy`） | 9 | medicine, natural_philosophy | — | — | — |
| 病原体説（`germ_theory`） | 10 | optics, chemistry, anatomy | — | — | health+0.12 |
| 予防接種（`vaccination`） | 11 | germ_theory | — | — | health+0.1 cap+0.05 |
| 抗生物質（`antibiotics`） | 11 | germ_theory, chemistry, industry | — | — | health+0.12 cap+0.05 |

## ⚖ 統治・行政・法

| 技術 | 列 | 前提 | 成立の条件 | 解禁 | 効果 |
|---|---|---|---|---|---|
| 長老会議（`kin_council`） | 2 | oral_tradition | — | polity:chiefdom | — |
| 行政（`administration`） | 6 | writing, kin_council | 規模1500 | polity:kingdom, admin:officials | tax+0.25 |
| 外交慣行（`diplomacy`） | 6 | writing, kin_council | — | treaty:alliance | — |
| 法（`law`） | 7 | administration | — | polity:republic | tax+0.05 |
| 戸籍・人口調査（`census`） | 7 | administration, counting | — | — | tax+0.06 |
| 租税制度（`tax_system`） | 7 | administration, record_keeping | — | policy:tax_high | tax+0.1 |
| 官僚制（`bureaucracy`） | 8 | law, census, tax_system | 規模8000 | polity:empire | tax+0.3 |
| 立憲主義（`constitutionalism`） | 8 | law, printing | — | — | — |
| 官吏登用（`civil_service`） | 9 | bureaucracy, papermaking | — | — | tax+0.08 learn+0.05 |
| 議会制（`parliament`） | 9 | constitutionalism | — | policy:parliament | tax+0.04 |
| 公教育（`public_education`） | 9 | printing, bureaucracy | — | — | learn+0.15 |

## ¤ 経済・金融

| 技術 | 列 | 前提 | 成立の条件 | 解禁 | 効果 |
|---|---|---|---|---|---|
| 交換網（`barter_networks`） | 2 | cordage, oral_tradition | — | treaty:nonaggression | — |
| 長距離交易（`trade_routes`） | 3 | barter_networks | — | treaty:trade, action:impose_sanctions | trade+0.1 |
| 市場（`markets`） | 5 | trade_routes, record_keeping | 規模1500・定住 | — | trade+0.08 tax+0.05 |
| 度量衡（`weights_measures`） | 7 | counting, administration | — | — | trade+0.04 |
| 貨幣（`coinage`） | 8 | bronze, weights_measures | 規模2000 | econ:coinage | tax+0.2 trade+0.1 |
| 金融（`banking`） | 9 | coinage, mathematics | 規模8000 | econ:credit | tax+0.25 ind+0.05 |
| 手形・信用（`credit_notes`） | 10 | banking, writing | — | — | trade+0.08 |
| 株式会社（`joint_stock`） | 10 | banking, law | — | — | ind+0.1 |
| 保険（`insurance`） | 11 | banking, statistics | — | — | trade+0.05 |
| 中央銀行（`central_bank`） | 11 | banking, bureaucracy, statistics | — | — | tax+0.05 |

## ⚔ 軍事・兵站

| 技術 | 列 | 前提 | 成立の条件 | 解禁 | 効果 |
|---|---|---|---|---|---|
| 狩猟具（`hunting_weapons`） | 3 | hafted_tools | — | — | off+0.02 |
| 弓（`bow`） | 3 | hafted_tools, cordage | — | unit:ranged | off+0.03 |
| 青銅武器（`bronze_weapons`） | 5 | bronze | — | unit:ranged | off+0.2 |
| 戦車（`chariot`） | 6 | wheel, horse_riding, bronze_weapons | — | — | off+0.1 |
| 騎兵（`cavalry`） | 6 | horse_riding, bronze_weapons | — | unit:cavalry | off+0.3 |
| 鉄武器（`iron_weapons`） | 6 | iron, bronze_weapons | — | — | off+0.35 |
| 攻城兵器（`siege_engines`） | 7 | iron_weapons, construction | — | — | off+0.05 |
| 兵站（`military_logistics`） | 7 | roads, administration | — | war:far | — |
| 海戦術（`naval_warfare`） | 7 | shipbuilding, iron_weapons | — | war:naval | off+0.05 |
| 弩（`crossbow`） | 7 | bow, iron_weapons | — | unit:ranged | off+0.04 |
| 常備軍（`standing_army`） | 8 | administration, iron_weapons, tax_system | — | — | off+0.08 def+0.04 |
| 板金鎧（`plate_armor`） | 8 | steel, iron_weapons | — | — | def+0.05 off+0.02 |
| 火薬（`gunpowder`） | 10 | steel, mathematics, chemistry | 規模8000 | unit:firearms | off+0.8 |
| 徴兵制（`conscription`） | 10 | standing_army, public_education | — | army:conscription | off+0.08 |
| 銃（`firearms`） | 11 | gunpowder, precision_tools | — | — | off+0.1 |
| 火砲（`artillery`） | 11 | gunpowder, bellows | — | — | off+0.1 def+0.03 |
| 施条銃（`rifled_arms`） | 12 | firearms, precision_tools | — | — | off+0.1 |
| 槍と銃の連携（`pike_and_shot`） | 12 | firearms, standing_army | — | — | off+0.06 def+0.03 |
| 榴弾砲・野砲（`howitzer`） | 12 | artillery, steel, industry | — | — | off+0.06 def+0.02 |
| 戦列艦（`ship_of_the_line`） | 12 | ocean_sailing, artillery, naval_warfare | — | unit:capital_ship | off+0.06 |
| 装甲艦（`ironclad`） | 12 | steamship, steel, artillery | — | — | off+0.08 def+0.03 |
| ロケット（`rocketry`） | 12 | internal_combustion, chemistry, calculus | — | — | off+0.03 |
| 機械化戦（`mechanized_warfare`） | 13 | motor_vehicle, steel, standing_army | — | unit:armor | off+0.2 |
| 後装式小銃（`breech_loading`） | 13 | rifled_arms, steel, industry | — | — | off+0.1 |
| 精密誘導兵器（`guided_munitions`） | 13 | computing, howitzer | — | — | off+0.1 |
| 魚雷（`torpedo`） | 13 | ironclad, internal_combustion | — | — | off+0.05 |
| 弩級戦艦（`dreadnought`） | 13 | ironclad, structural_steel, electricity | — | unit:battleship | off+0.1 def+0.03 |
| 弾道ミサイル（`ballistic_missile`） | 13 | rocketry, computing | — | unit:strategic_missile | off+0.06 |
| 機関銃（`machine_gun`） | 14 | breech_loading, industry | — | — | off+0.05 def+0.1 |
| 特殊部隊（`special_forces`） | 14 | radio, standing_army | — | unit:special | off+0.03 |
| 指揮統制網（`network_warfare`） | 14 | radio, computing | — | — | off+0.05 def+0.05 |
| 潜水艦（`submarine`） | 14 | torpedo, electricity | — | unit:submarine | off+0.04 |
| 航空母艦（`aircraft_carrier`） | 14 | dreadnought, aviation | — | unit:carrier | off+0.08 |
| レーダー・ソナー（`radar_sonar`） | 14 | radio, electric_grid | — | — | def+0.05 |
| 誘導ミサイル（`guided_missiles`） | 14 | rocketry, guided_munitions | — | unit:missile_force | off+0.1 |
| 核戦力（`nuclear_arsenal`） | 14 | nuclear, ballistic_missile | — | unit:nuclear_force, action:nuclear_weapon | def+0.08 |
| 塹壕と鉄条網（`trench_warfare`） | 15 | machine_gun, fortification | — | — | def+0.1 |
| 戦車（`tank`） | 15 | mechanized_warfare, machine_gun | — | unit:armor | off+0.12 |
| 原子力推進（`nuclear_propulsion`） | 15 | nuclear, submarine | — | — | off+0.04 |
| 軍用航空（`military_aviation`） | 15 | aviation, machine_gun | — | unit:air_corps | off+0.05 |
| 防空網（`air_defense`） | 15 | radar_sonar, guided_missiles | — | — | def+0.06 |
| サイバー戦（`cyber_warfare`） | 15 | computing, network_warfare | — | unit:cyber | def+0.03 |
| 指向性エネルギー兵器（`directed_energy`） | 15 | electric_grid, guided_missiles | — | — | def+0.08 |
| 対戦車兵器（`anti_tank`） | 16 | tank, howitzer | — | — | def+0.08 |
| 機械化歩兵（`motorized_infantry`） | 16 | tank, radio | — | unit:mechanized | off+0.06 |
| 水陸両用戦（`amphibious_assault`） | 16 | steamship, tank | — | unit:marine | off+0.05 |
| 戦闘機（`fighter_aircraft`） | 16 | military_aviation, radio | — | unit:fighter | def+0.04 |
| 爆撃機（`bomber_aircraft`） | 16 | military_aviation, steel | — | unit:bomber | off+0.06 |
| ジェット機関（`jet_engine`） | 16 | military_aviation, petroleum, precision_tools | — | — | off+0.04 |
| ヘリコプター（`helicopter`） | 16 | military_aviation, internal_combustion | — | unit:helicopter | off+0.03 |
| 軌道戦（`orbital_warfare`） | 16 | satellites, directed_energy | — | unit:orbital | off+0.05 def+0.05 |
| 認知戦（`cognitive_warfare`） | 16 | cyber_warfare, machine_learning | — | — | def+0.05 |
| ステルス（`stealth`） | 17 | jet_engine, radar_sonar, computing | — | — | off+0.05 |
| 無人機（`drone_warfare`） | 17 | guided_munitions, jet_engine, network_warfare | — | unit:drone | off+0.05 |
| 自律兵器（`autonomous_systems`） | 18 | drone_warfare, machine_learning | — | unit:autonomous | off+0.08 |
| 極超音速兵器（`hypersonic_weapons`） | 18 | ballistic_missile, stealth | — | — | off+0.08 |
| 強化外骨格（`power_armor`） | 19 | autonomous_systems, special_forces | — | — | off+0.05 |

## ⚙ エネルギー・産業

| 技術 | 列 | 前提 | 成立の条件 | 解禁 | 効果 |
|---|---|---|---|---|---|
| 採鉱（`mining`） | 5 | bronze, construction | 規模500 | — | ind+0.05 |
| 水車（`waterwheel`） | 6 | construction, wheel | water | — | ind+0.1 |
| 風車（`windmill`） | 7 | waterwheel | — | — | ind+0.06 |
| 石炭採掘（`coal_mining`） | 7 | mining, bellows | 規模6000・coal | — | ind+0.1 |
| 蒸気機関（`steam_engine`） | 9 | coal_mining, precision_tools | 規模15000 | — | ind+0.25 |
| 機械工業（`industry`） | 10 | steel, steam_engine, banking | 規模20000 | — | ind+0.5 |
| 石油（`petroleum`） | 10 | chemistry, mining | coal | — | ind+0.1 |
| 電気（`electricity`） | 11 | industry | 規模40000 | — | ind+0.3 |
| 内燃機関（`internal_combustion`） | 11 | industry, chemistry | — | — | ind+0.15 |
| 送電網（`electric_grid`） | 12 | electricity, industry | — | — | ind+0.2 |
| 核（`nuclear`） | 12 | electricity, calculus | 規模100000 | action:nuclear_program | ind+0.1 |
| 核融合（`fusion_power`） | 14 | nuclear, machine_learning | — | — | ind+0.2 |

