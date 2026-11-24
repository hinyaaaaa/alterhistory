# コマンド一覧（自動生成: npm run docs）

画面は `dispatch(world, { type, authority, ...引数 })` だけで世界を変える。引数の形は `js/core/wcde/commands.js` と `war-commands.js` の `defineCommand` を見る。

| type | 権限 | 領域 | 時期 |
|---|---|---|---|
| `alliance.create` | player_order | war_diplomacy | running |
| `alliance.expel` | player_order | war_diplomacy | running |
| `alliance.invite` | player_order | war_diplomacy | running |
| `alliance.leave` | player_order | war_diplomacy | running |
| `alliance.respondCall` | player_order | war_diplomacy | running |
| `alliance.setObligation` | player_order | war_diplomacy | running |
| `alliance.transferLead` | player_order | war_diplomacy | running |
| `battle.auto` | player_order |  | running |
| `battle.order` | player_order |  | running |
| `battle.reinforce` | player_order |  | running |
| `battle.tick` | player_order |  | running |
| `calendar.edit` | administrative, creator_intervention | clock | prehistory, founding, running |
| `capital.move` | player_order, creator_intervention | states | running |
| `clock.run` | administrative | clock | running |
| `clock.setSpeed` | administrative | clock | prehistory, founding, running |
| `conference.bid` | player_order | war_diplomacy | running |
| `conference.finish` | player_order | war_diplomacy | running |
| `conference.retract` | player_order | war_diplomacy | running |
| `control.release` | administrative | states | running |
| `control.take` | administrative | states | running |
| `corps.appoint` | player_order | war_diplomacy | running |
| `corps.appointChief` | player_order | war_diplomacy | running |
| `corps.commit` | player_order | war_diplomacy | running |
| `corps.convert` | player_order | war_diplomacy | running |
| `corps.create` | player_order | war_diplomacy | running |
| `corps.dismiss` | player_order | war_diplomacy | running |
| `corps.dismissChief` | player_order | war_diplomacy | running |
| `corps.merge` | player_order | war_diplomacy | running |
| `corps.order` | player_order | war_diplomacy | running |
| `corps.refresh` | player_order | war_diplomacy | running |
| `corps.rename` | player_order | war_diplomacy | running |
| `corps.renameUnit` | player_order | war_diplomacy | running |
| `corps.setComposition` | player_order | war_diplomacy | running |
| `corps.split` | player_order | war_diplomacy | running |
| `corps.transfer` | player_order | war_diplomacy | running |
| `creator.cancelIntervention` | creator_intervention | interventions | running |
| `creator.catastrophe` | creator_intervention | interventions | running |
| `creator.editState` | creator_intervention | interventions | running |
| `creator.found` | creator_intervention | interventions | running |
| `creator.intervene` | creator_intervention | interventions | running |
| `creator.rename` | creator_intervention | interventions | founding, running |
| `creator.techEdit` | creator_intervention | interventions | running |
| `creator.techEditReset` | creator_intervention | interventions | running |
| `creator.techGrant` | creator_intervention | interventions | running |
| `decision.resolve` | player_order | war_diplomacy | running |
| `diplomacy.dependency` | player_order | war_diplomacy | running |
| `diplomacy.pactCreate` | player_order | war_diplomacy | running |
| `diplomacy.pactJoin` | player_order | war_diplomacy | running |
| `diplomacy.pactLeave` | player_order | war_diplomacy | running |
| `diplomacy.peace` | player_order | war_diplomacy | running |
| `diplomacy.propose` | player_order | war_diplomacy | running |
| `doctrine.switch` | player_order, creator_intervention |  | running |
| `doctrine.switchCost` | player_order, administrative |  | prehistory, founding, running |
| `focus.set` | player_order | states | running |
| `founding.delegate` | administrative | states | founding |
| `founding.found` | player_order | states | founding |
| `founding.options` | administrative | states | founding, running |
| `founding.refresh` | administrative | states | founding |
| `news.ack` | administrative | integrity | prehistory, founding, running |
| `ops.covert` | player_order |  | running |
| `ops.nuclear` | player_order |  | running |
| `ops.nukeTargets` | player_order |  | running |
| `peace.accept` | player_order | war_diplomacy | running |
| `peace.predict` | player_order, administrative, creator_intervention | war_diplomacy | running |
| `peace.propose` | player_order | war_diplomacy | running |
| `peace.reject` | player_order | war_diplomacy | running |
| `settlement.rename` | player_order, creator_intervention |  | running |
| `state.act` | player_order | states | running |
| `state.adoptDoctrine` | player_order | states | running |
| `state.changeLeader` | player_order, creator_intervention | states | running |
| `state.rename` | player_order, creator_intervention | states | running |
| `state.reorganize` | player_order, creator_intervention | states | running |
| `state.setFinance` | player_order, creator_intervention | states | running |
| `state.setFlag` | player_order, creator_intervention | states | running |
| `state.setOffices` | player_order, creator_intervention | states | running |
| `state.setOrbat` | player_order, creator_intervention | states | running |
| `state.setRegime` | player_order, creator_intervention | states | running |
| `surrender.accept` | player_order | war_diplomacy | running |
| `surrender.counter` | player_order | war_diplomacy | running |
| `surrender.resist` | player_order | war_diplomacy | running |
| `tech.preview` | creator_intervention | tech | prehistory, founding, running |
| `time.advance` | administrative | clock | running |
| `uprising.plan` | player_order | states | running |
| `uprising.start` | player_order | states | running |
| `view.past` | administrative | integrity | prehistory, founding, running |
| `war.declare` | player_order | war_diplomacy | running |
| `war.direct` | player_order | war_diplomacy | running |
| `war.mobilize` | player_order | war_diplomacy | running |
| `war.predict` | player_order, administrative, creator_intervention | war_diplomacy | running |
| `war.setPlan` | player_order | war_diplomacy | running |
| `war.setStance` | player_order | war_diplomacy | running |
| `war.view` | player_order, administrative, creator_intervention | war_diplomacy | running |
