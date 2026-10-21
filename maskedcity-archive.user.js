// ==UserScript==
// @name         MaskedCity Event Archive
// @namespace    local.maskedcity.archive
// @version      0.6.0
// @homepageURL  https://github.com/lvl11evelyn/mc-event-logger/blob/main/README.md
// @updateURL    https://github.com/lvl11evelyn/mc-event-logger/raw/refs/heads/main/maskedcity-archive.user.js
// @downloadURL  https://github.com/lvl11evelyn/mc-event-logger/raw/refs/heads/main/maskedcity-archive.user.js
// @description  Automatically preserve Arena, Streets, Hollow fights, and pet feeding results; export JSON or offline HTML.
// @match        https://maskedcity.com/*
// @match        https://www.maskedcity.com/*
// @exclude      https://maskedcity.com/wiki*
// @exclude      https://www.maskedcity.com/wiki*
// @run-at       document-start
// @noframes
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_listValues
// @grant        GM_registerMenuCommand
// ==/UserScript==

(() => {
  'use strict';
  const allowed = () => ['maskedcity.com', 'www.maskedcity.com'].includes(location.hostname)
    && !/^\/wiki/i.test(location.pathname);
  if (!allowed()) return;
  const PREFIX = 'mc-event-v1:';
  const known = new WeakMap();
  const petAlerts = new WeakMap();
  const hollowFights = new WeakMap();
  const PET_RESULT_SELECTOR = '.alert, #petFeedMsg';
  const SERVER_TIME_ZONE = 'America/Los_Angeles';
  const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  let host, shadow, status, error = '';
  let lastDeleted = null;
  const popouts = new Map();
  let popoutLayer=10, gesture=null, renderPending=false, renderQueued=false;
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const clean = node => (node?.textContent || '').replace(/\s+/g, ' ').trim();
  // Construct a passive snapshot from an allowlist. Never copy attributes,
  // scripts, forms, remote resources, URLs, or hidden control values.
  function snapshot(node) {
    if (node.nodeType === 3) return escape(node.textContent);
    if (node.nodeType !== 1) return '';
    const tag = node.tagName.toLowerCase();
    if (['script','style','form','input','button','textarea','select','svg','iframe','object','embed','template','noscript','img','link','meta'].includes(tag)) return '';
    if (node.hidden || node.getAttribute('aria-hidden') === 'true') return '';
    const body = Array.from(node.childNodes, snapshot).join('');
    return ['div','p','span','strong','b','em','i','ul','ol','li','table','thead','tbody','tr','th','td','h1','h2','h3','h4','br','hr','section','article'].includes(tag)
      ? `<${tag}>${body}${['br','hr'].includes(tag) ? '' : `</${tag}>`}` : body;
  }
  function passiveText(node) {
    const container = document.createElement('div');
    container.innerHTML = snapshot(node);
    container.querySelectorAll('div,p,li,tr,h1,h2,h3,h4,br').forEach(el => el.append(document.createTextNode('\n')));
    return container.textContent.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  function stats(node) {
    return Array.from(node?.querySelectorAll('.stat') || [], el => ({
      label: clean(el.querySelector('.stat__k')), value: clean(el.querySelector('.stat__v'))
    })).filter(row => row.label);
  }
  function battlePanel(report) {
    const next = report.nextElementSibling;
    return next && /Battle Statistics/i.test(clean(next.querySelector('.panel__title'))) ? next : null;
  }
  function parseSpecialRewards(text) {
    return uniqueRewards([
      ...Array.from(text.matchAll(/SPECIAL REWARD:\s*(\+\s*[\d,]+(?:\.\d+)?\s*(?:Explore\s+Turns|Points?|Energy|Scraps?|Intelligence)\b|[^\n]+)/g), match => match[1].trim()),
      // Recover the supplied Lucky Break banner from older saved text too.
      ...Array.from(text.matchAll(/Lucky Break!\s*Bonus reward received\.\s*(\+?\s*\d[^\n]*)/gi), match => match[1].trim())
    ]);
  }
  function uniqueRewards(values) {
    const found=new Map();
    for (const value of values) {
      const label=value.replace(/\s+/g,' ').trim();
      const key=label.replace(/^\+\s*/,'').toLowerCase();
      if (key && !found.has(key)) found.set(key,label);
    }
    return [...found.values()];
  }
  function specialRewards(node) {
    return uniqueRewards([
      ...Array.from(node.querySelectorAll('.reward-banner .reward-label'),clean),
      ...parseSpecialRewards(passiveText(node))
    ]);
  }
  function rewardScope(node) {
    return node.closest('main') || node.parentElement || node;
  }
  function arena(report) {
    const battle = battlePanel(report);
    return {
      type: 'arena', title: clean(report.querySelector('.panel__title')) || 'Arena report',
      outcome: clean(report.querySelector('.panel__more')),
      lines: Array.from(report.querySelectorAll('.combat-log-line'), clean),
      rewards: stats(report), battleStatistics: stats(battle),
      specialRewards: specialRewards(rewardScope(report)),
      text: passiveText(report) + (battle ? '\n\n' + passiveText(battle) : ''),
      snapshotHtml: snapshot(report) + (battle ? snapshot(battle) : '')
    };
  }
  function streets(result) {
    // The result, outcome and context are siblings. The job picker between
    // them is deliberately excluded: available jobs aren't the completed job.
    const siblings = Array.from(result.parentElement?.children || []);
    const outcome = siblings.find(el => el.matches('.st-out'));
    const context = siblings.find(el => el.matches('.st-strip'));
    const sections = [result, outcome, context].filter(Boolean);
    const tag = clean(result.querySelector('.st-hit__tag'));
    return {
      type: 'streets', title: tag ? `Streets · ${tag}` : 'Streets result',
      outcome: tag, story: clean(result.querySelector('.st-hit__line')),
      specialRewards: specialRewards(rewardScope(result)),
      rewards: [
        {label: 'Cash', value: clean(result.querySelector('.st-hit__cash'))},
        {label: 'EXP', value: clean(result.querySelector('.st-hit__xp'))},
        {label: 'Reputation', value: clean(result.querySelector('.st-hit__rep'))}
      ].filter(row => row.value),
      outcomeStatistics: Array.from(outcome?.querySelectorAll('.st-out__stat') || [], row => ({
        label: clean(row.querySelector('.st-out__k')), value: clean(row.querySelector('.st-out__v'))
      })),
      bonusBreakdown: Array.from(outcome?.querySelectorAll('.st-take__brow') || [], row => ({
        source: clean(row.querySelector('.st-take__blabel')),
        cash: clean(row.querySelector('.st-take__bcash')),
        exp: clean(row.querySelector('.st-take__bxp')),
        isTotal: row.classList.contains('st-take__btotal')
      })),
      momentum: clean(context?.querySelector('.st-streak')),
      boosts: Array.from(context?.querySelectorAll('.boost__row') || [], passiveText),
      boostDetails: Array.from(context?.querySelectorAll('.boost__row') || [], row => {
        const label = row.firstElementChild?.cloneNode(true);
        const kind = clean(label?.querySelector('small'));
        label?.querySelectorAll('small').forEach(el => el.remove());
        return {label: clean(label), kind, value: clean(row.querySelector('.boost__v'))};
      }),
      momentumDetails: {
        progress: clean(context?.querySelector('.st-streak-val')),
        bonus: clean(context?.querySelector('.st-streak-pct')),
        note: clean(context?.querySelector('.st-streak-foot'))
      },
      streetLevel: clean(context?.querySelector('.st-level__head')),
      notes: clean(context?.querySelector('.st-strip__notes')),
      text: sections.map(passiveText).join('\n\n'),
      snapshotHtml: sections.map(snapshot).join('')
    };
  }
  function shown(node) {
    if (!node) return false;
    for (let el=node; el; el=el.parentElement) {
      if (el.hidden || el.getAttribute('aria-hidden')==='true' || el.style.display==='none' || el.style.visibility==='hidden') return false;
    }
    return true;
  }
  function hollow(panel) {
    const pick=selector=>panel.querySelector(selector);
    const opponent=clean(pick('#hlFightName')), outcome=clean(pick('#hlFightResult'));
    const hero=pick('#hlFightHero'), meta=pick('#hlFightMeta');
    if (!shown(hero) || !shown(pick('#hlFightResult')) || !opponent || !/\b(VICTORY|DEFEAT|DRAW|WON|LOST)\b/i.test(outcome) || !clean(meta)) return null;
    const rows=Array.from(panel.querySelectorAll('#hlFightRewards .hlf-reward')).filter(shown);
    const read=(id,label)=>{
      const row=rows.find(el=>el.id===id), value=clean(row?.querySelector('b'));
      return value ? {label,value} : null;
    };
    const currencies=[['hlRwEcto','Ectoplasm'],['hlRwGold','Gold'],['hlRwCash','Cash'],['hlRwScraps','Scraps']].map(([id,label])=>read(id,label)).filter(Boolean);
    const statGains=[['hlRwSpeed','Speed'],['hlRwPower','Power'],['hlRwStrength','Strength']].map(([id,label])=>read(id,label)).filter(Boolean)
      .map(row=>({...row,stat:row.label.toLowerCase(),amount:Number(row.value.replace(/[^\d.+-]/g,''))})).filter(row=>Number.isFinite(row.amount));
    // More than one visible stat row is an intermediate render, not evidence
    // that this one fight awarded several stats. Wait for its completed shape.
    if (statGains.length>1) return null;
    const equipmentExperience=rows.filter(el=>el.classList.contains('hlf-reward--gear')).map(el=>({label:clean(el.querySelector('span')),value:clean(el.querySelector('b')),leveledUp:el.classList.contains('is-up')})).filter(row=>row.label && row.value);
    const itemDrops=rows.filter(el=>el.classList.contains('hlf-reward--loot')).map(el=>({label:clean(el.querySelector('span')) || 'Pawn item',value:clean(el.querySelector('b'))})).filter(row=>row.label!=='Pawn item' || row.value);
    const dialogue=pick('#hlFightDialogue');
    const levelUps=[...new Set([
      ...equipmentExperience.filter(row=>row.leveledUp).map(row=>`${row.label} — ${row.value}`),
      ...[outcome,clean(meta),...rows.filter(el=>!el.classList.contains('is-up')).map(clean),...(shown(dialogue)?[passiveText(dialogue)]:[])]
        .flatMap(text=>text.split('\n')).filter(text=>/\b(?:leve(?:lled|led)\s+up|level[ -]?up|gained\s+(?:a\s+|\d+\s+)?levels?|reached\s+level)\b/i.test(text))
    ])];
    const health=clean(meta).match(/([\d,]+(?:\.\d+)?)\s*(?:health|HP)\s*(?:left|remaining)/i);
    const turns=clean(meta).match(/(\d+)\s*turns?/i);
    const selected=[pick('#hlFightName'),pick('#hlFightResult'),meta,...rows,...(shown(dialogue)&&levelUps.length?[dialogue]:[])].filter(Boolean);
    return {
      type:'hollow',title:opponent,opponent,outcome,
      experience:read('hlRwExp','Experience')?.value || '',reputation:read('hlRwRep','Reputation')?.value || '',
      equipmentExperience,statGains,currencies,itemDrops,levelUps,
      remainingHealth:health?.[1] || '',turns:turns?.[1] || '',
      text:selected.map(passiveText).join('\n\n'),snapshotHtml:selected.map(snapshot).join('')
    };
  }
  function captureHollow(panel, freshResult = false) {
    let state=hollowFights.get(panel);
    if ((!panel.isConnected && state) || !shown(panel)) return;
    const payload=hollow(panel);
    if (!payload) {
      if (state) state.awaiting=true;
      return;
    }
    const appendedLevel=state && payload.opponent===state.opponent && payload.remainingHealth===state.health
      && payload.outcome!==state.outcome && payload.outcome.startsWith(state.outcome) && payload.levelUps.length;
    if (!state || state.awaiting || (freshResult && !appendedLevel)) state={token:{},awaiting:false};
    Object.assign(state,{opponent:payload.opponent,health:payload.remainingHealth,outcome:payload.outcome});
    hollowFights.set(panel,state);
    save(state.token,payload);
  }
  function capturePetMeal(alert, changed = false) {
    const petId = location.pathname.match(/^\/pets\/(\d+)\/?$/)?.[1];
    if (!petId) return;
    const full = clean(alert);
    const meal = full.match(/^(.+?) ate (.+?)\.\s*\(([^)]+)\)/);
    const levelMeal = full.match(/^(.+?) ate (.+?) and ((?:leveled|levelled) up\b.*)$/i);
    if (!meal && !levelMeal) return;
    const [, petName, food] = meal || levelMeal;
    const gains = meal?.[3] || '';
    const scope = alert.closest('.content-frame') || alert.parentElement;
    // Preserve the entire suffix without requiring a particular level-up
    // sentence. The game appends its notices to the feeding message itself.
    const suffix = meal ? full.slice(meal[0].length).trim() : `${petName} ${levelMeal[3]}`;
    const notices = suffix ? [suffix] : [];
    const levelUps = notices.filter(line => /\blevel(?:s|led|ed)?\b/i.test(line));
    let state = petAlerts.get(alert);
    const base = meal?.[0] || `${petName} ate ${food}`;
    // A notification element may be reused. A new meal gets a separate token;
    // later context/level-up additions update that meal rather than replacing it.
    const addedNotice = notices.some(line => !state?.notices.includes(line));
    if (!state || state.base !== base || (changed && document.readyState !== 'loading' && !addedNotice)) {
      state = {token: {}, base, notices: []};
    }
    state.notices = notices;
    petAlerts.set(alert, state);
    const levelAfter = clean(scope?.querySelector('.ax-stat__k'));
    save(state.token, {
      type:'pet-feeding', petId, petName, title:`${petName} · ${food}`,
      food, gains, mealText:`${food}.${gains ? ` (${gains.replace(/\blife\b/gi, 'LIFE')})` : ''}`,
      notices, levelUps, levelAfter: /^Level\s+\d+/i.test(levelAfter) ? levelAfter : '',
      text: full,
      snapshotHtml: snapshot(alert)
    });
  }
  function records() {
    return GM_listValues().filter(key => key.startsWith(PREFIX)).map(key => GM_getValue(key))
      .filter(record => record && !record.deleted).sort((a,b) => b.firstObservedAt.localeCompare(a.firstObservedAt));
  }
  function serverParts(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    const fields = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
      timeZone:SERVER_TIME_ZONE, year:'numeric',month:'2-digit',day:'2-digit',
      hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
    }).formatToParts(date).map(part=>[part.type,part.value]));
    return Object.fromEntries(['year','month','day','hour','minute','second'].map(key=>[key,Number(fields[key])]));
  }
  function readServerTime(value) {
    const parts = serverParts(value);
    if (!parts) return null;
    const clock = clean(document.querySelector('#hudServerTimeText'));
    const match = clock.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
    let source = 'pacific-fallback';
    if (match) {
      let hour = Number(match[1]);
      const minute=Number(match[2]),second=Number(match[3] || 0),period=match[4]?.toUpperCase();
      if (minute<60 && second<60 && (period ? hour>=1 && hour<=12 : hour<24)) {
        if (period) hour=hour%12+(period==='PM'?12:0);
        Object.assign(parts,{hour,minute,second}); source='header';
        const headerDate=clean(document.querySelector('#v2ClockDate')).match(/\b([A-Za-z]{3})\s+(\d{1,2})\b/);
        const month=headerDate ? MONTHS.indexOf(headerDate[1].toUpperCase())+1 : 0;
        if (month && Number(headerDate[2])>=1 && Number(headerDate[2])<=31) {
          const day=Number(headerDate[2]);
          // Header dates omit the year. Select the closest year around the
          // current Pacific date, including Dec/Jan boundaries.
          const reference=Date.UTC(parts.year,parts.month-1,parts.day);
          const year=[parts.year-1,parts.year,parts.year+1].sort((a,b)=>Math.abs(Date.UTC(a,month-1,day)-reference)-Math.abs(Date.UTC(b,month-1,day)-reference))[0];
          Object.assign(parts,{year,month,day});
        }
      }
    }
    return {...parts,timeZone:SERVER_TIME_ZONE,source};
  }
  function indicate(message) {
    const text = message || (error ? `Save failed: ${error}` : 'Recorder ready · Arena + Streets + Hollow + Pet meals automatic');
    if (status && status.textContent !== text) status.textContent = text;
  }
  function save(node, payload, forceNew = false) {
    if (!allowed()) return;
    let state = forceNew ? null : known.get(node);
    // Keep the deleted live observation from being saved again by its observer.
    if (state && GM_getValue(PREFIX + state.record.id)?.deleted) return;
    const fingerprint = JSON.stringify(payload);
    if (state?.fingerprint === fingerprint) return;
    const now = new Date().toISOString();
    const serverTime = readServerTime(now);
    const record = state ? structuredClone(state.record) : {
      schemaVersion: 1, recorderVersion: '0.6.0', id: crypto.randomUUID(),
      firstObservedAt: now, firstServerTime: serverTime, source: {origin: location.origin, path: location.pathname},
      captureMethod: forceNew ? 'manual' : 'dom-observer', revisions: []
    };
    record.lastObservedAt = now;
    record.lastServerTime = serverTime;
    record.revisions.push({observedAt: now, serverTime, ...payload});
    try {
      GM_setValue(PREFIX + record.id, record);
      known.set(node, {record, fingerprint});
      error = '';
      indicate(`Saved ${payload.title}${payload.lines ? ` · ${payload.lines.length} log lines` : ''}`);
      if (shadow && (popouts.size || shadow.querySelector('dialog').open)) scheduleRender();
    } catch (failure) {
      error = String(failure.message || failure); indicate();
      console.error('MaskedCity archive save failed', failure);
    }
  }
  function scan(root = document) {
    if (!allowed() || !root.querySelectorAll) return;
    const reports = Array.from(root.querySelectorAll('.arena-report, .st-hit'));
    if (root.matches?.('.arena-report, .st-hit')) reports.push(root);
    reports.forEach(report => {
      // A replaced result has already been archived with its sibling rewards
      // and stats. Don't overwrite it with a now-detached, incomplete view.
      if (!report.isConnected && known.has(report)) return;
      if (report.matches('.arena-report') && report.querySelector('.combat-log-line')) save(report, arena(report));
      else if (report.matches('.st-hit') && clean(report.querySelector('.st-hit__line, .st-hit__cash'))) save(report, streets(report));
    });
    const hollowPanels=Array.from(root.querySelectorAll('#hlFight'));
    if (root.matches?.('#hlFight')) hollowPanels.push(root);
    hollowPanels.forEach(panel=>captureHollow(panel));
    if (/^\/pets\/\d+\/?$/.test(location.pathname)) {
      const alerts = Array.from(root.querySelectorAll(PET_RESULT_SELECTOR));
      if (root.matches?.(PET_RESULT_SELECTOR)) alerts.push(root);
      alerts.forEach(alert => capturePetMeal(alert));
    }
  }
  function manual() {
    if (!allowed()) return;
    const main = document.querySelector('main.page-content') || document.querySelector('main');
    if (!main) { indicate('No main content found; nothing captured.'); return; }
    save(main, {type: 'manual', title: clean(main.querySelector('h1,h2,.panel__title')) || document.title,
      specialRewards: specialRewards(main),
      text: passiveText(main), snapshotHtml: snapshot(main)}, true);
  }
  function download(content, type, suffix) {
    const url = URL.createObjectURL(new Blob([content], {type}));
    const a = document.createElement('a');
    const stamp=readServerTime(new Date().toISOString());
    const two=number=>String(number).padStart(2,'0');
    a.href = url; a.download = `maskedcity-archive-${stamp.year}-${two(stamp.month)}-${two(stamp.day)}-${two(stamp.hour)}${two(stamp.minute)}${two(stamp.second)}-Pacific.${suffix}`;
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function exportJson() {
    const exportedAt=new Date().toISOString();
    download(JSON.stringify({schemaVersion: 1, exportedAt, exportedServerTime:readServerTime(exportedAt), timeZone:SERVER_TIME_ZONE, events: records()}, null, 2), 'application/json', 'json');
  }
  function formatTime(value, recordedServerTime) {
    const parts=recordedServerTime || serverParts(value);
    if (!parts) return String(value);
    const two=number=>String(number).padStart(2,'0');
    return `${two(parts.day)}-${MONTHS[parts.month-1]}-${parts.year} ${two(parts.hour)}:${two(parts.minute)}:${two(parts.second)}`;
  }
  function formatMealTime(value, recordedServerTime) {
    const parts=recordedServerTime || serverParts(value);
    if (!parts) return '????-??-??';
    const two = number => String(number).padStart(2, '0');
    return `${two(parts.hour)}${two(parts.minute)}-${two(parts.day)}-${two(parts.month)}`;
  }
  const table = (headers, rows) => rows?.length ? `<div class="table-wrap"><table><thead><tr>${headers.map(h => `<th>${escape(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${escape(cell ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '';
  const pairs = rows => table(['Item','Value'], rows?.map(row => [row.label, row.value]));
  const section = (title, body) => body ? `<section class="event-section"><h3>${escape(title)}</h3>${body}</section>` : '';
  const paragraph = text => text ? `<p>${escape(text)}</p>` : '';
  function eventBody(current) {
    if (current.type==='hollow') return section('Result',pairs([
      {label:'Opponent',value:current.opponent},{label:'Outcome',value:current.outcome},
      {label:'Remaining health',value:current.remainingHealth || 'Not shown'}
    ])) + section('Experience · Reputation',pairs([
      ...(current.experience?[{label:'Experience',value:current.experience}]:[]),
      ...(current.reputation?[{label:'Reputation',value:current.reputation}]:[])
    ])) + section('Equipment experience',pairs(current.equipmentExperience))
      + section('Stat gained',pairs(current.statGains)) + section('Currency drops',pairs(current.currencies))
      + section('Item drops',pairs(current.itemDrops))
      + section('Level-ups',current.levelUps?.map(paragraph).join(''));
    if (current.type === 'pet-feeding') return paragraph(current.mealText)
      + (current.notices || current.levelUps || []).map(line => `<p class="pet-level-up">${escape(line)}</p>`).join('');
    if (current.type === 'streets') {
      const momentum = current.momentumDetails;
      return section('Story', paragraph(current.story))
        + section('Take', pairs(current.rewards))
        + section('Street · Witnesses · Alliance', pairs(current.outcomeStatistics))
        + section('Breakdown', table(['Source','Cash','EXP'], current.bonusBreakdown?.map(row => [row.source, row.cash, row.exp])))
        + section('Momentum', momentum ? paragraph([momentum.progress, momentum.bonus].filter(Boolean).join(' · ')) + paragraph(momentum.note) : paragraph(current.momentum))
        + section('Boosts', current.boostDetails?.length ? table(['Boost','Applies to','Value'], current.boostDetails.map(row => [row.label,row.kind,row.value])) : (current.boosts?.length ? `<ul>${current.boosts.map(boost => `<li>${escape(boost)}</li>`).join('')}</ul>` : ''))
        + section('Street level', paragraph(current.streetLevel) + paragraph(current.notes));
    }
    if (current.type === 'arena') return section('Outcome', paragraph(current.outcome))
      + section('Rewards', pairs(current.rewards))
      + section('Battle statistics', pairs(current.battleStatistics))
      + section('Fight log', current.lines?.length ? `<div class="fight-log">${current.lines.map(line => `<p>${escape(line)}</p>`).join('')}</div>` : '');
    return section('Captured content', `<pre>${escape(current.text || '')}</pre>`);
  }
  function deleteControl(record) {
    return `<button type="button" class="delete-event" data-delete-id="${escape(record.id)}" aria-label="Delete ${escape(record.revisions.at(-1).title)}" title="Delete this record">×</button>`;
  }
  function deleteRecord(id) {
    const record=GM_getValue(PREFIX+id);
    if (!record || record.deleted) return;
    try {
      // Remove its content while retaining a small suppression marker. Undo
      // keeps only the latest deleted record in memory until this page closes.
      GM_setValue(PREFIX+id,{id,deleted:true});
      lastDeleted=record;
      renderArchive(); indicate('Record deleted · Undo is available in the panel.');
    } catch(failure) { indicate(`Delete failed: ${failure.message || failure}`); }
  }
  function undoDelete() {
    if (!lastDeleted) return;
    try {
      GM_setValue(PREFIX+lastDeleted.id,lastDeleted);
      lastDeleted=null; renderArchive(); indicate('Record restored.');
    } catch(failure) { indicate(`Restore failed: ${failure.message || failure}`); }
  }
  function eventMarkup(record, editable = false) {
    const latest = record.revisions.at(-1);
    const isHollow=latest.type==='hollow';
    const rewards = isHollow ? latest.levelUps || [] : latest.specialRewards?.length ? latest.specialRewards : parseSpecialRewards(latest.text || '');
    const ecto=latest.currencies?.find(row=>row.label==='Ectoplasm')?.value || '0';
    const title=isHollow ? `${latest.opponent} - ${ecto} Ecto - ${latest.statGains?.map(row=>`${row.value} ${row.label}`).join(' · ') || 'No stat gain'}` : latest.title;
    return `<details class="event" data-id="${escape(record.id)}"><summary><span>${escape(formatTime(record.firstObservedAt, record.firstServerTime))} - ${escape(title)}</span>${rewards.length ? `<span class="special-reward" title="${isHollow?'Level-ups':'SPECIAL REWARD'}">${escape(rewards.join(' · '))}</span>` : ''}</summary><div class="event-content"><div class="event-meta-row"><p class="metadata">${escape(record.source.path)} · ${escape(record.captureMethod)} · ${record.revisions.length} revision(s)</p>${editable ? deleteControl(record) : ''}</div>${eventBody(latest)}`
      + (record.revisions.length > 1 ? `<details class="revisions"><summary>Earlier observations (${record.revisions.length - 1})</summary>${record.revisions.slice(0,-1).map(r => `<section><h3>${escape(formatTime(r.observedAt, r.serverTime))}</h3>${eventBody(r)}</section>`).join('')}</details>` : '')
      + '</div></details>';
  }
  function groupedEvents(saved, editable = false) {
    const groups = [
      {type:'streets', label:'STREETS', events:[]},
      {type:'arena', label:'FIGHTS', events:[]},
      {type:'hollow', label:'THE HOLLOW', events:[]},
      {type:'other', label:'OTHER', events:[]}
    ];
    const pets = new Map();
    for (const record of saved) {
      const type = record.revisions.at(-1)?.type;
      if (type === 'pet-feeding') {
        const meal = record.revisions.at(-1);
        if (!pets.has(meal.petId)) pets.set(meal.petId, {name:meal.petName, events:[]});
        pets.get(meal.petId).events.push(record);
        continue;
      }
      (groups.find(group => group.type === type) || groups[3]).events.push(record);
    }
    const hollowTotals={speed:0,power:0,strength:0};
    for (const record of groups[2].events) for (const gain of record.revisions.at(-1).statGains || []) {
      if (Object.hasOwn(hollowTotals,gain.stat) && Number.isFinite(gain.amount)) hollowTotals[gain.stat]=Math.round((hollowTotals[gain.stat]+gain.amount)*1e9)/1e9;
    }
    const hollowHeading=`<span class="hollow-heading"><b>THE HOLLOW</b>${[['speed','Spd'],['power','Pow'],['strength','Str']].map(([stat,label])=>`<span class="hollow-total ${stat}" data-stat="${stat}" title="Stat gains in retained Hollow fight records">${label}: ${hollowTotals[stat]>=0?'+':''}${hollowTotals[stat]}</span>`).join('')}</span>`;
    const groupMarkup = group => `<details class="event-group" data-type="${group.type}"><summary>${group.type==='hollow'?hollowHeading:group.label}</summary><div class="group-events">${group.events.map(record=>eventMarkup(record,editable)).join('') || '<p class="metadata">No events saved yet.</p>'}</div></details>`;
    const petMarkup = pets.size ? `<div class="pet-row" aria-label="Pet meal histories">${Array.from(pets, ([id, pet]) => `<details class="event-group pet-group" data-type="pet:${escape(id)}"><summary>${escape(pet.name)}</summary><div class="pet-meals">${pet.events.map(record => {
      const meal = record.revisions.at(-1);
      return `<div class="pet-meal" data-id="${escape(record.id)}"><div class="pet-meal-heading"><p>${escape(meal.mealText)}</p><time class="pet-time" datetime="${escape(record.firstObservedAt)}" title="${escape(formatTime(record.firstObservedAt, record.firstServerTime))}">${escape(formatMealTime(record.firstObservedAt, record.firstServerTime))}</time>${editable ? deleteControl(record) : ''}</div>${(meal.notices || meal.levelUps || []).map(line => `<p class="pet-level-up">${escape(line)}</p>`).join('')}</div>`;
    }).join('')}</div></details>`).join('')}</div>` : '';
    return groups.slice(0,3).map(groupMarkup).join('') + petMarkup + (groups[3].events.length ? groupMarkup(groups[3]) : '');
  }
  const petCss = `.pet-row{display:flex;flex-wrap:wrap;align-items:flex-start;gap:8px;margin:8px 0}.pet-group{flex:0 0 calc((100% - 16px)/3);min-width:0}.pet-group>summary{overflow-wrap:anywhere}.pet-meals{padding:0 10px}.pet-meal{padding:10px 0;border-bottom:1px solid #40566b;overflow-wrap:anywhere}.pet-meal:last-child{border-bottom:0}.pet-meal p{margin:4px 0;line-height:1.6}.pet-meal-heading{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:4px 8px}.pet-meal-heading p{flex:1 1 120px}.pet-time{font:11px ui-monospace,monospace;color:#9db0c4;font-variant-numeric:tabular-nums;white-space:nowrap;flex:none}.pet-level-up{border-top:1px solid #536b82;padding-top:8px;color:#ffd780}@media(max-width:600px){.pet-row{gap:4px}.pet-group{flex-basis:calc((100% - 8px)/3)}.pet-group>summary{padding:10px 4px;font-size:13px}.pet-meals{padding:0 6px}.pet-meal{font-size:12px}}`;
  const groupCss = `.hollow-heading{display:inline-flex;justify-content:center;align-items:center;flex-wrap:wrap;gap:8px 16px}.hollow-heading b{letter-spacing:.1em}.hollow-total{font-size:13px;letter-spacing:0;font-variant-numeric:tabular-nums}.hollow-total.speed{color:#76acff}.hollow-total.power{color:#ff8088}.hollow-total.strength{color:#73dc96}.event-group{margin-bottom:4px;border:1px solid #536b82;border-radius:6px;background:#142231;overflow:hidden}.event-group>summary{list-style:none;text-align:center;font-size:16px;font-weight:bold;letter-spacing:.05em;padding:12px 14px;cursor:pointer;border-radius:5px;background:#1c3043;transition:background-color .15s ease}.event-group>summary::-webkit-details-marker{display:none}.event-group>summary::after{content:' ▸';color:#aaceec}.event-group[open]>summary::after{content:' ▾'}.event-group>summary:hover,.event>summary:hover{background:#29445c}.event-group[open]>summary{border-bottom:1px solid #40566b;border-radius:5px 5px 0 0}.group-events{padding:0 10px}.event>summary{border-radius:5px;transition:background-color .15s ease}`;
  const contentCss = `*{box-sizing:border-box}.event{border:1px solid #536b82;border-radius:6px;margin:10px 0;background:#142231}.event>summary{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:14px;cursor:pointer;list-style:none;font-weight:650}.event>summary::-webkit-details-marker{display:none}.event>summary>span:first-child{min-width:0;overflow-wrap:anywhere}.event>summary>span:first-child::before{content:'▸ ';color:#9cbedb}.event[open]>summary>span:first-child::before{content:'▾ '}.event[open]>summary{border-bottom:1px solid #40566b}.special-reward{max-width:50%;overflow-wrap:anywhere;color:#ffd780;flex-shrink:0;text-align:right}.event-content{padding:4px 18px 18px}.event-section{margin-top:20px}.event-section h3{font-size:15px;color:#aaceec;margin:0 0 8px}.event-section p{margin:6px 0;line-height:1.6}.metadata{color:#9db0c4;font-size:12px}.table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:14px;color:inherit}th,td{padding:8px 10px;text-align:left;border-bottom:1px solid #30475c;vertical-align:top}th{color:#aaceec}td:not(:first-child){white-space:nowrap}.fight-log p{padding:6px 0;border-bottom:1px solid #30475c}.revisions{margin-top:20px}.revisions>summary{cursor:pointer;color:#aaceec}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.6 system-ui}summary:focus-visible,button:focus-visible{outline:2px solid #ffd780;outline-offset:2px}@media(max-width:600px){.event>summary{gap:10px;font-size:12px}.special-reward{max-width:40%;white-space:normal}.event-content{padding:4px 10px 12px}}`;
  function exportHtml() {
    const sections = groupedEvents(records());
    download(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>MaskedCity Event Archive</title><style>body{max-width:1180px;margin:32px auto;padding:0 20px;font:16px system-ui;color:#e8edf3;background:#111820}${contentCss}${groupCss}${petCss}</style><h1>MaskedCity Event Archive</h1><p>Recorded browser observations. All displayed times use MaskedCity server time (Pacific); JSON also retains UTC observation times.</p>${sections || '<p>No events saved.</p>'}</html>`, 'text/html', 'html');
  }
  function scheduleRender() {
    if (renderQueued) return;
    renderQueued=true;
    queueMicrotask(()=>{
      renderQueued=false;
      if (gesture) renderPending=true;
      else renderArchive();
    });
  }
  function sectionLabel(group) {
    const type=group.dataset.type;
    return ({streets:'STREETS',arena:'FIGHTS',hollow:'THE HOLLOW',other:'OTHER'})[type]
      || group.querySelector(':scope > summary .section-label')?.textContent.trim()
      || group.querySelector(':scope > summary').textContent.trim();
  }
  function decorateGroup(group) {
    const summary=group.querySelector(':scope > summary');
    if (!summary.querySelector('.section-label')) {
      const label=document.createElement('span');label.className='section-label';
      label.append(...summary.childNodes);summary.append(label);
    }
    if (!summary.querySelector('.popout-toggle')) {
      const button=document.createElement('button');button.type='button';button.className='popout-toggle';
      summary.prepend(button);
    }
    const popped=group.classList.contains('popped-out');
    const button=summary.querySelector('.popout-toggle');
    button.setAttribute('aria-label',`${popped?'Dock':'Pop out'} ${sectionLabel(group)}`);
    button.setAttribute('aria-pressed',String(popped));button.title=button.getAttribute('aria-label');
    if (popped) for (const side of ['left','right']) {
      if (group.querySelector(`:scope > [data-resize="${side}"]`)) continue;
      const handle=document.createElement('button');handle.type='button';handle.className=`resize-handle resize-${side}`;
      handle.dataset.resize=side;handle.setAttribute('aria-label',`Resize ${sectionLabel(group)} from lower ${side} corner`);
      handle.title='Drag to resize; arrow keys also resize';group.append(handle);
    }
  }
  function workspace() {
    const controls=shadow.querySelector('#controls').getBoundingClientRect();
    return {left:8,top:8,right:Math.max(9,innerWidth-8),bottom:Math.max(9,controls.top-8)};
  }
  // Measure the unwrapped header, including its disclosure and docking controls.
  function headerMinimum(group) {
    const probe=document.createElement('details');probe.className='event-group header-probe';
    probe.append(group.querySelector(':scope > summary').cloneNode(true));
    shadow.querySelector('#popouts').append(probe);
    const width=Math.ceil(probe.getBoundingClientRect().width)+2;
    probe.remove();return Math.max(240,width);
  }
  function canPopOut(group) {
    return innerWidth>=768 && headerMinimum(group)<=workspace().right-workspace().left;
  }
  function dockGroup(type,state) {
    state.placeholder.replaceWith(state.group);popouts.delete(type);
    state.group.classList.remove('popped-out');state.group.removeAttribute('style');
    state.group.querySelectorAll(':scope > .resize-handle').forEach(el=>el.remove());
    decorateGroup(state.group);
  }
  function placePopout(group, box) {
    const area=workspace(),maxWidth=area.right-area.left,maxHeight=area.bottom-area.top;
    const width=Math.min(maxWidth,Math.max(Math.min(headerMinimum(group),maxWidth),box.width));
    const height=Math.min(maxHeight,Math.max(Math.min(120,maxHeight),box.height));
    const left=Math.max(area.left,Math.min(area.right-width,box.left));
    const top=Math.max(area.top,Math.min(area.bottom-height,box.top));
    Object.assign(group.style,{left:`${left}px`,top:`${top}px`,width:`${width}px`,height:`${height}px`});
    const headerHeight=group.querySelector(':scope > summary').getBoundingClientRect().height;
    group.style.setProperty('--float-body-height',`${Math.max(0,height-headerHeight-2)}px`);
  }
  function updateBounds() {
    if (!shadow) return;
    const area=workspace();
    host.style.setProperty('--panel-bottom',`${innerHeight-area.bottom}px`);
    for (const [type,state] of popouts) if (!canPopOut(state.group)) dockGroup(type,state);
    shadow.querySelectorAll('.popout-toggle').forEach(button=>{
      const allowed=canPopOut(button.closest('.event-group'));
      button.disabled=!allowed;button.hidden=!allowed;
    });
    // Docked headers compact to their actual column width without wrapping.
    shadow.querySelectorAll('.event-group:not(.popped-out)').forEach(group=>{
      group.style.setProperty('--header-scale','1');
      const summary=group.querySelector(':scope > summary'),label=summary.querySelector('.section-label');
      if (!summary.clientWidth || !label) return;
      let scale=1;
      for (let i=0;i<3;i++) {
        const css=getComputedStyle(summary);
        const available=summary.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight)-parseFloat(css.fontSize)*1.5;
        const width=label.getBoundingClientRect().width;
        if (width<=available || available<=0) break;
        scale*=available/width;group.style.setProperty('--header-scale',String(scale));
      }
    });
    for (const {group} of popouts.values()) placePopout(group,{
      left:parseFloat(group.style.left),top:parseFloat(group.style.top),
      width:parseFloat(group.style.width),height:parseFloat(group.style.height)
    });
  }
  function togglePopout(group) {
    const type=group.dataset.type,existing=popouts.get(type);
    if (existing) {
      dockGroup(type,existing);
    } else {
      if (!canPopOut(group)) return;
      const rect=group.getBoundingClientRect(),placeholder=document.createComment(`Dock ${type}`);
      group.replaceWith(placeholder);group.style.removeProperty('--header-scale');group.classList.add('popped-out');
      shadow.querySelector('#popouts').append(group);popouts.set(type,{group,placeholder});
      group.style.zIndex=String(++popoutLayer);
      placePopout(group,{left:rect.left+24,top:rect.top-24,width:group.classList.contains('pet-group')?420:720,height:Math.max(280,Math.min(560,rect.height))});
    }
    decorateGroup(group);updateBounds();
  }
  function renderArchive() {
    if (!shadow) return;
    const list = shadow.querySelector('#events');
    const saved = records();
    const expanded = new Set(Array.from(shadow.querySelectorAll('.event[open]'), el => el.dataset.id));
    const expandedGroups = new Set(Array.from(shadow.querySelectorAll('.event-group[open]'), el => el.dataset.type));
    const listScroll=list.scrollTop;
    list.innerHTML = groupedEvents(saved,true);
    for (const [type,state] of popouts) {
      const fresh=Array.from(list.querySelectorAll('.event-group')).find(el=>el.dataset.type===type);
      if (!fresh) {state.group.remove();popouts.delete(type);continue;}
      const body=state.group.querySelector(':scope > .group-events, :scope > .pet-meals');
      const scroll=body?.scrollTop || 0;
      state.group.replaceChildren(...fresh.childNodes);
      state.placeholder=document.createComment(`Dock ${type}`);fresh.replaceWith(state.placeholder);
      const newBody=state.group.querySelector(':scope > .group-events, :scope > .pet-meals');
      if (newBody) newBody.scrollTop=scroll;
    }
    shadow.querySelector('#undo').hidden=!lastDeleted;
    shadow.querySelectorAll('.event').forEach(el => { el.open = expanded.has(el.dataset.id); });
    shadow.querySelectorAll('.event-group').forEach(el => { el.open = expandedGroups.has(el.dataset.type);decorateGroup(el); });
    list.scrollTop=listScroll;updateBounds();
  }
  function review() {
    renderArchive();
    const dialog=shadow.querySelector('dialog');
    if (!dialog.open) dialog.show();
    updateBounds();
  }
  function resizedBox(base, side, dx, dy) {
    const area=workspace(),minimum=Math.min(base.minimumWidth,area.right-area.left);
    const right=base.left+base.width;
    const width=side==='left'
      ? Math.max(minimum,Math.min(right-area.left,base.width-dx))
      : Math.max(minimum,Math.min(area.right-base.left,base.width+dx));
    return {left:side==='left'?right-width:base.left,top:base.top,width,
      height:Math.max(Math.min(120,area.bottom-base.top),Math.min(area.bottom-base.top,base.height+dy))};
  }
  function installPopoutInteraction() {
    let suppressedSummary=null;
    shadow.addEventListener('click',event=>{
      if (suppressedSummary?.contains(event.target)) {
        event.preventDefault();event.stopPropagation();suppressedSummary=null;return;
      }
      const toggle=event.target.closest('.popout-toggle');
      if (toggle) {event.preventDefault();event.stopPropagation();togglePopout(toggle.closest('.event-group'));}
    },true);
    shadow.addEventListener('pointerdown',event=>{
      suppressedSummary=null;
      if (event.button!==0) return;
      const group=event.target.closest('.popped-out');
      if (!group) return;
      group.style.zIndex=String(++popoutLayer);
      const handle=event.target.closest('.resize-handle');
      const summary=group.querySelector(':scope > summary');
      if (!handle && (!summary.contains(event.target) || event.target.closest('button,a,input'))) return;
      const rect=group.getBoundingClientRect();
      gesture={group,summary,target:handle || summary,pointerId:event.pointerId,
        mode:handle?'resize':'drag',side:handle?.dataset.resize,x:event.clientX,y:event.clientY,moved:false,
        base:{left:rect.left,top:rect.top,width:rect.width,height:parseFloat(group.style.height),minimumWidth:headerMinimum(group)}};
      gesture.target.setPointerCapture(event.pointerId);
      if (handle) event.preventDefault();
    });
    shadow.addEventListener('pointermove',event=>{
      if (!gesture || gesture.pointerId!==event.pointerId) return;
      const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
      if (!gesture.moved && Math.hypot(dx,dy)<5) return;
      gesture.moved=true;event.preventDefault();
      placePopout(gesture.group,gesture.mode==='drag'
        ? {...gesture.base,left:gesture.base.left+dx,top:gesture.base.top+dy}
        : resizedBox(gesture.base,gesture.side,dx,dy));
    });
    const finish=event=>{
      if (!gesture || gesture.pointerId!==event.pointerId) return;
      if (gesture.moved && gesture.mode==='drag' && event.type!=='pointercancel') suppressedSummary=gesture.summary;
      if (gesture.target.hasPointerCapture(event.pointerId)) gesture.target.releasePointerCapture(event.pointerId);
      gesture=null;
      if (renderPending) {renderPending=false;scheduleRender();}
    };
    shadow.addEventListener('pointerup',finish);shadow.addEventListener('pointercancel',finish);
    shadow.addEventListener('keydown',event=>{
      const handle=event.target.closest('.resize-handle');
      if (!handle || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
      event.preventDefault();const group=handle.closest('.popped-out'),rect=group.getBoundingClientRect(),step=event.shiftKey?40:10;
      placePopout(group,resizedBox({left:rect.left,top:rect.top,width:rect.width,height:parseFloat(group.style.height),minimumWidth:headerMinimum(group)},handle.dataset.resize,
        event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,
        event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0));
    });
    shadow.addEventListener('toggle',event=>{
      if (event.target.matches?.('.popped-out')) updateBounds();
    },true);
  }
  // Independent controls and dockable section surfaces.
  const controlsCss = `button{font-size:13px;font-family:var(--font-ui)}.event-meta-row{display:flex;align-items:center;justify-content:space-between;gap:12px}.event-meta-row .metadata{min-width:0;overflow-wrap:anywhere}.delete-event{flex:none;width:30px;height:30px;padding:0;margin:6px 0;background:#8f2028;border-color:#db6570;color:#fff;font:24px/1 system-ui;border-radius:4px}.delete-event:hover{background:#bc2935}.pet-meal-heading .delete-event{width:22px;height:22px;margin:0;font-size:18px}#controls{position:fixed;bottom:6px;left:12px;display:flex;gap:8px;padding:0;border:0;background:transparent;pointer-events:none;z-index:1000000}#controls button{pointer-events:auto;opacity:1;margin:0}#status{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}#popouts{pointer-events:none}.event-group>summary{position:relative;padding-left:42px;padding-right:42px;white-space:nowrap;overflow-wrap:normal;font-size:calc(16px * var(--header-scale,1))}.hollow-total{font-size:calc(13px * var(--header-scale,1))}.hollow-heading{flex-wrap:nowrap;white-space:nowrap}.section-label{white-space:nowrap}.header-probe{position:fixed!important;left:-10000px!important;top:0!important;width:max-content!important;max-width:none!important;min-width:0!important;visibility:hidden;pointer-events:none}.popout-toggle[hidden]{display:none}.popout-toggle{position:absolute;left:6px;top:6px;width:24px;height:24px;margin:0;padding:0;display:inline-grid;place-items:center;font-size:16px;letter-spacing:0;cursor:pointer}.popout-toggle::before{content:'↗'}.popped-out>summary>.popout-toggle::before{content:'↙'}.popped-out{position:fixed;margin:0;pointer-events:auto;flex:none;max-width:calc(100vw - 16px);box-shadow:0 6px 24px #0008;isolation:isolate}.popped-out:not([open]){height:auto!important}.popped-out>summary{cursor:grab;touch-action:none;user-select:none}.popped-out>summary:active{cursor:grabbing}.popped-out[open]>.group-events,.popped-out[open]>.pet-meals{max-height:var(--float-body-height);overflow:auto;overscroll-behavior:contain;padding-bottom:20px}.resize-handle{position:absolute;bottom:0;width:18px;height:18px;margin:0;padding:0;border:0;border-radius:0;background:transparent;z-index:2;touch-action:none}.resize-right{right:0;cursor:se-resize}.resize-left{left:0;cursor:sw-resize}.resize-handle::before{content:'';position:absolute;bottom:4px;width:8px;height:8px;border-bottom:2px solid #aaceec}.resize-right::before{right:4px;border-right:2px solid #aaceec}.resize-left::before{left:4px;border-left:2px solid #aaceec}.pet-row:empty{display:none}@media(max-width:767px){.event-group>summary{padding:12px 8px;overflow-x:auto}.popout-toggle{display:none}.hollow-heading{gap:8px;font-size:calc(13px * var(--header-scale,1))}.hollow-total{font-size:calc(11px * var(--header-scale,1))}.pet-group>summary{padding:12px 4px;font-size:calc(13px * var(--header-scale,1))}}`;
  function mount() {
    if (host || !document.body || !allowed()) return;
    host = document.createElement('div');
    host.id = 'maskedcity-event-archive';
    shadow = host.attachShadow({mode:'closed'});
    shadow.innerHTML = `<style>:host{all:initial;position:fixed;inset:0;z-index:2147483646;font:13px system-ui;color:#edf3fa;pointer-events:none}button{font:inherit;background:#263e55;color:#fff;border:1px solid #7890a8;border-radius:4px;padding:7px;cursor:pointer;margin:3px}dialog{pointer-events:auto;position:fixed;inset:auto;left:12px;bottom:var(--panel-bottom,52px);margin:0;background:#101b27;color:#edf3fa;border:1px solid #7890a8;border-radius:8px;width:min(1180px,calc(100vw - 24px));height:auto;max-height:calc(100dvh - var(--panel-bottom,52px) - 8px);padding:14px}dialog[open]{display:flex;flex-direction:column}.toolbar{flex:none;display:flex;align-items:center;flex-wrap:wrap;gap:6px}.toolbar strong{margin-right:auto}#events{flex:0 1 auto;min-height:0;overflow:auto;overscroll-behavior:contain;margin-top:10px;padding-right:6px}${contentCss}${groupCss}${petCss}${controlsCss}</style><div id="controls"><button id="review">Review</button><button id="manual">Capture page</button></div><span id="status" role="status"></span><dialog aria-label="MaskedCity saved events"><div class="toolbar"><strong>Saved events</strong><button id="refresh">Refresh</button><button id="json">Export JSON</button><button id="html">Export HTML</button><button id="undo" hidden>Undo delete</button><button id="close">Close</button></div><div id="events"></div></dialog><div id="popouts"></div>`;
    document.body.append(host);
    shadow.querySelector('#review').onclick = () => {
      const dialog = shadow.querySelector('dialog');
      if (dialog.open) dialog.close();
      else review();
    };
    shadow.querySelector('#manual').onclick = manual;
    shadow.querySelector('#refresh').onclick = review;
    shadow.querySelector('#close').onclick = () => shadow.querySelector('dialog').close();
    shadow.querySelector('#json').onclick = exportJson;
    shadow.querySelector('#html').onclick = exportHtml;
    shadow.querySelector('#undo').onclick = undoDelete;
    shadow.addEventListener('click', event => {
      const button=event.target.closest('button[data-delete-id]');
      if (button) deleteRecord(button.dataset.deleteId);
    });
    document.addEventListener('pointerdown', event => {
      if (!event.composedPath().includes(host)) shadow.querySelector('dialog').close();
    }, true);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') shadow.querySelector('dialog').close();
    });
    installPopoutInteraction();
    new ResizeObserver(updateBounds).observe(shadow.querySelector('#controls'));
    window.addEventListener('resize',updateBounds);
    updateBounds();indicate();
  }
  const observer = new MutationObserver(mutations => {
    if (!allowed()) { if (host) host.style.display = 'none'; return; }
    if (host) host.style.display = '';
    // Process changed feeding alerts once per delivery before generic scans.
    // Identical text rewritten into the same alert still represents a new meal.
    const changedAlerts = new Set();
    const changedHollow = new Map();
    for (const mutation of mutations) {
      const element = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
      const alert = element?.closest?.(PET_RESULT_SELECTOR);
      if (mutation.type!=='attributes' && alert && petAlerts.has(alert)) changedAlerts.add(alert);
      const panel=element?.closest?.('#hlFight');
      if (panel) {
        const resultWritten=mutation.type!=='attributes' && (element.closest?.('#hlFightResult') || Array.from(mutation.addedNodes).some(node=>node.nodeType===1 && (node.id==='hlFightResult' || node.querySelector('#hlFightResult'))));
        changedHollow.set(panel,changedHollow.get(panel) || Boolean(resultWritten));
      }
    }
    changedAlerts.forEach(alert => capturePetMeal(alert, true));
    changedHollow.forEach((fresh,panel)=>captureHollow(panel,fresh && hollowFights.has(panel)));
    // Include detached reports: a panel inserted and removed in a single task
    // can still be captured from the mutation record's retained node.
    for (const mutation of mutations) {
      for (const node of [...mutation.addedNodes, ...mutation.removedNodes]) scan(node);
      const element = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
      const report = element?.closest?.('.arena-report, .st-hit');
      if (report) scan(report);
    }
    scan(); mount();
  });
  observer.observe(document, {subtree:true, childList:true, characterData:true,attributes:true,attributeFilter:['hidden','aria-hidden','class']});
  document.addEventListener('DOMContentLoaded', () => { scan(); mount(); }, {once:true});
  window.addEventListener('pageshow', () => { scan(); mount(); });
  document.addEventListener('click', () => scan(), true);
  document.addEventListener('submit', () => scan(), true);
  GM_registerMenuCommand('Review MaskedCity archive', () => { mount(); review(); });
  GM_registerMenuCommand('Capture current event page', manual);
  GM_registerMenuCommand('Export MaskedCity archive JSON', exportJson);
  GM_registerMenuCommand('Export MaskedCity archive HTML', exportHtml);
  scan(); mount();
})();
