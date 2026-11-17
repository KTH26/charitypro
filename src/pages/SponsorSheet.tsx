import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Printer, Save } from 'lucide-react';
import { HDate } from '@hebcal/core';
import { MonthNav } from '../components/HebrewCalendar';
import { hebMonthName, hebYearText, todayHebrew } from '../utils/hebrewCalendar';
import { buildSheet, dayLetters, endLine, nameLine, titleLine, type SheetDay, type SheetSponsor } from '../utils/sponsorSheet';

type Item = SheetDay & { id: string; kind: 'day' | 'month' };
type Settings = { contactTitle: string; contactName: string; contactEnd: string; contactPhone: string };
const DEFAULT_SETTINGS: Settings = { contactTitle: 'הר"ר', contactName: 'יצחק הערש מאליק', contactEnd: 'הי"ו', contactPhone: '514-464-2175' };
const plain = (text: string) => text.replace(/[׳״]/g, (mark: string) => (mark === '״' ? '"' : "'"));

/** One sponsor box: the day tabs on top, then title, name, הי"ו and the dedication. */
const Box: React.FC<{ days: number[]; sponsor: SheetSponsor | null; span: number }> = ({ days, sponsor, span }) => {
  const wide = span >= 3;
  return <div className={`ss-box ${sponsor ? '' : 'ss-free'} ${wide ? 'ss-wide' : ''}`} style={{ gridColumn: `span ${span}` }}>
    <div className="ss-tabs">{days.map(day => <span key={day} className="ss-tab">{dayLetters(day)}</span>)}</div>
    {sponsor ? <div className="ss-body">
      {wide ? <div className="ss-oneline"><span className="ss-title">{titleLine(sponsor)}</span> <span className="ss-name">{nameLine(sponsor)}</span> <span className="ss-end">{endLine(sponsor)}</span></div>
        : <><div className="ss-title">{titleLine(sponsor)}</div><div className="ss-name">{nameLine(sponsor)}</div><div className="ss-end">{endLine(sponsor)}</div></>}
      {sponsor.honoree && <div className="ss-honoree">{sponsor.honoree}</div>}
      {sponsor.notes && <div className="ss-honoree">{sponsor.notes}</div>}
    </div> : <div className="ss-body ss-open">פנוי</div>}
  </div>;
};

/** The monthly sponsor list, ready to print (17 × 11 inches, like the designer's sheet). */
export const SponsorSheet: React.FC = () => {
  const today = todayHebrew();
  const start = new URLSearchParams(window.location.search);
  const [view, setView] = useState({ month: Number(start.get('month')) || today.getMonth(), year: Number(start.get('year')) || today.getFullYear() });
  const [items, setItems] = useState<Item[]>([]); const [error, setError] = useState('');
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS); const [notice, setNotice] = useState('');
  const [scale, setScale] = useState(0.5); const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = 'sponsor-sheet-fonts';
    if (!document.getElementById(id)) { const link = document.createElement('link'); link.id = id; link.rel = 'stylesheet'; link.href = 'https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@500;700;900&family=Noto+Serif+Hebrew:wght@400;600&display=swap'; document.head.appendChild(link); }
  }, []);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/v3/sponsor-sheet?hebYear=${view.year}&hebMonth=${view.month}`); const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load the sponsors.');
        if (cancelled) return; setItems(data.items || []); setSettings({ ...DEFAULT_SETTINGS, ...(data.settings || {}) }); setError('');
      } catch (reason: any) { if (!cancelled) setError(reason.message); }
    })();
    return () => { cancelled = true; };
  }, [view.month, view.year]);
  useEffect(() => {
    const fit = () => { const width = wrap.current?.clientWidth || 1200; setScale(Math.min(1, width / 1632)); };
    fit(); window.addEventListener('resize', fit); return () => window.removeEventListener('resize', fit);
  }, []);

  const daysInMonth = HDate.daysInMonth(view.month, view.year);
  const rows = useMemo(() => buildSheet(daysInMonth, items.filter(item => item.kind === 'day' && item.day >= 1)), [items, daysInMonth]);
  const patron = items.find(item => item.kind === 'month') || null;
  const month = hebMonthName(view.month, view.year); const year = plain(hebYearText(view.year));
  const taken = items.filter(item => item.kind === 'day').length;
  const saveSettings = async () => {
    setNotice('');
    const response = await fetch('/api/v3/sponsor-sheet/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
    const data = await response.json().catch(() => ({})); setNotice(response.ok && data.success ? 'Saved.' : data.error || 'Unable to save.');
  };

  return <div className="ss-page">
    <style>{SHEET_CSS}</style>
    <div className="ss-controls no-print">
      <div><div style={{ color: 'var(--green)', fontWeight: 800, fontSize: 13 }}>CHARITYPRO CLOUD</div><h1 style={{ margin: '4px 0', color: 'var(--navy)' }}>Monthly sponsor list</h1><div style={{ color: 'var(--text-muted)' }}>{taken} of {daysInMonth} days taken{patron ? ' · month patron: ' + nameLine(patron) : ' · no month patron yet'}. Book days on the Calendar page.</div></div>
      <MonthNav year={view.year} month={view.month} onChange={(nextMonth, nextYear) => setView({ month: nextMonth, year: nextYear })} />
      <div className="ss-settings">
        <span>Who to call:</span>
        <input dir="rtl" value={settings.contactTitle} onChange={event => setSettings({ ...settings, contactTitle: event.target.value })} style={{ width: 60 }} />
        <input dir="rtl" value={settings.contactName} onChange={event => setSettings({ ...settings, contactName: event.target.value })} style={{ width: 170 }} />
        <input dir="rtl" value={settings.contactEnd} onChange={event => setSettings({ ...settings, contactEnd: event.target.value })} style={{ width: 60 }} />
        <input value={settings.contactPhone} onChange={event => setSettings({ ...settings, contactPhone: event.target.value })} style={{ width: 130 }} />
        <button className="btn btn-secondary btn-sm" onClick={() => void saveSettings()}><Save size={14} /> Save</button>{notice && <small>{notice}</small>}
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => window.print()}><Printer size={16} /> Print / save as PDF</button>
      </div>
      {error && <div className="pay-error">{error}</div>}
      <small style={{ color: 'var(--text-muted)' }}>In the print window choose paper 11 × 17 (Tabloid), landscape, margins none, and turn on "Background graphics".</small>
    </div>
    <div ref={wrap} className="ss-wrap" style={{ height: 1056 * scale }}>
      <div className="ss-sheet" dir="rtl" style={{ transform: `scale(${scale})` }}>
        <div className="ss-kicker">מ כ י ר ת &nbsp; ז כ ו ת &nbsp; י ו מ י &nbsp; ה צ ל ה</div>
        <div className="ss-main">
          <aside className="ss-side">
            <div className="ss-card ss-intro">
              <p className="ss-small">ברוב הכרת הטוב הננו בזה להביע בשער בת רבים<br />הני נדבנים שזכות לנדב</p>
              <div className="ss-ribbon"><div className="ss-ribbon-top">יום הצלה בחודש</div><div className="ss-ribbon-month">{month} {year}</div></div>
              <p className="ss-small">ובזה קנו חלק נכבד בזכות הצלת נפשות מישראל מידי יום ביומו</p>
              <div className="ss-dear">טייערע אידן!</div>
              <p className="ss-yid">הצלה לויפט אויף די מסירות נפש פון<br />די מעמבערס, און אויף אייער ספאנסערשיפ</p>
              <div className="ss-reward">שכרכם הרבה מאוד!</div>
              <div className="ss-contact"><p>נאכנישט גענומען א טייל? אזוי אויך אויסציוועלן<br />אייער טאג לע"נ וכדו' פארבינט אייך היינט מיט</p><div className="ss-contact-name"><small>{settings.contactTitle}</small> {settings.contactName} <small>{settings.contactEnd}</small></div><div className="ss-phone">{settings.contactPhone}</div></div>
            </div>
            <div className="ss-card ss-patron">
              <div className="ss-patron-head">פטרון החודש</div>
              {patron ? <>
                <p className="ss-small">ברוב רגשי הכרת הטוב הננו בזה להביע את מיטב ברכותינו אל מול כבוד ידידינו הדגול, אהוב ונחמד על כל יודעיו ומכיריו, אין גומרין עליו את ההלל, הלא הוא הרבני הנגיד והנכבד מוזיל זהב מכיסו למען הצלת נפשות</p>
                <div className="ss-patron-name"><small>כבוד מוה"ר</small> {patron.hebFirstName || nameLine(patron)}</div>
                <div className="ss-patron-name">{[patron.hebLastName, patron.title].filter(Boolean).join(' ')} <small>{endLine(patron)}</small></div>
                <p className="ss-small">אשר זכה בכתר על ראשו בכתרה של הצלה עם רכישת זכות</p>
                <div className="ss-patron-band">פטרון הצלה לחודש {month}</div>
                {patron.honoree && <div className="ss-honoree">{patron.honoree}</div>}
                {patron.notes && <div className="ss-honoree">{patron.notes}</div>}
              </> : <div className="ss-open" style={{ padding: 30 }}>פנוי</div>}
            </div>
          </aside>
          <section className="ss-card ss-calendar">
            <div className="ss-badge"><img src="/hatzolah-tosh-logo.png" alt="" /><div className="ss-badge-text">חברה<br />הצלה</div></div>
            <div className="ss-grid">{rows.map((row, index) => <div key={index} className="ss-row">{row.map(box => <Box key={box.days.join('-')} {...box} />)}</div>)}</div>
          </section>
        </div>
      </div>
    </div>
  </div>;
};

const SHEET_CSS = `
.ss-page{padding:24px 28px}
.ss-controls{display:grid;gap:12px;margin-bottom:16px}
.ss-settings{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.ss-settings input{padding:6px 8px;border:1px solid var(--border,#d0d7de);border-radius:6px}
.ss-wrap{width:100%;overflow:hidden}
.ss-sheet{width:1632px;height:1056px;transform-origin:top left;position:relative;box-sizing:border-box;padding:34px 40px;
  background:linear-gradient(135deg,#dfeef0 0%,#c9dfe2 45%,#a9c7cc 100%);font-family:'Frank Ruhl Libre','Noto Serif Hebrew',serif;color:#1d3c43;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;box-shadow:0 4px 24px rgba(0,0,0,.12)}
.ss-kicker{text-align:center;font-size:17px;letter-spacing:2px;color:#2d5a61;margin-bottom:14px}
.ss-main{display:grid;grid-template-columns:330px 1fr;gap:34px;height:calc(100% - 40px)}
.ss-card{background:#fbfdfc;border-radius:22px;box-shadow:0 2px 10px rgba(0,0,0,.12);box-sizing:border-box}
.ss-side{display:grid;grid-template-rows:auto 1fr;gap:26px}
.ss-intro{padding:22px 22px 18px;text-align:center;border:2px solid #cfe3e6}
.ss-small{font-size:12px;line-height:1.45;margin:4px 0;color:#2d4a50}
.ss-ribbon{margin:10px 0;border:3px solid #e2553d;border-radius:10px;overflow:hidden}
.ss-ribbon-top{background:#fff;color:#e2553d;font-weight:900;font-size:22px;padding:4px}
.ss-ribbon-month{background:#e2553d;color:#fff;font-weight:900;font-size:44px;line-height:1.15;padding:4px 6px 8px}
.ss-dear{color:#e2553d;font-weight:900;font-size:24px;margin-top:8px}
.ss-yid{font-size:14px;line-height:1.45;margin:4px 0}
.ss-reward{color:#e2553d;font-weight:900;font-size:26px;margin:4px 0 10px}
.ss-contact{border-top:1px solid #d8e6e8;padding-top:8px;font-size:11px}
.ss-contact p{margin:0 0 4px}
.ss-contact-name{font-weight:700;font-size:15px}.ss-contact-name small{font-size:10px}
.ss-phone{display:inline-block;margin-top:4px;border:1.5px solid #2d5a61;border-radius:6px;padding:1px 10px;font-weight:700;font-size:15px;direction:ltr}
.ss-patron{padding:18px 22px;text-align:center;border:2px solid #cfe3e6}
.ss-patron-head{display:inline-block;border:2px solid #e2553d;color:#e2553d;font-weight:900;font-size:28px;padding:2px 26px;border-radius:6px;margin-bottom:8px}
.ss-patron-name{font-weight:900;font-size:30px;line-height:1.15;color:#1d3c43}.ss-patron-name small{font-size:13px;font-weight:600}
.ss-patron-band{background:#e2553d;color:#fff;font-weight:900;font-size:24px;border-radius:8px;padding:4px 8px;margin:8px 0}
.ss-calendar{position:relative;padding:86px 26px 22px;border:2px solid #cfe3e6}
.ss-badge{position:absolute;top:-30px;left:50%;transform:translateX(-50%);background:#2f5b62;border-radius:16px;padding:8px 22px;display:flex;align-items:center;gap:14px;box-shadow:0 2px 8px rgba(0,0,0,.2)}
.ss-badge img{height:84px;width:84px;object-fit:contain;background:#fff;border-radius:50%;padding:4px}
.ss-badge-text{color:#fff;font-weight:900;font-size:36px;line-height:.95;text-align:center}
.ss-grid{display:grid;gap:18px}
.ss-row{display:grid;grid-template-columns:repeat(7,1fr);gap:12px}
.ss-box{position:relative;background:#e3f4f6;border:1.5px solid #9fc9cf;border-radius:12px;min-height:150px;padding:30px 8px 8px;box-sizing:border-box;text-align:center;display:flex;flex-direction:column;justify-content:center}
.ss-free{background:#f5f8f8;border-style:dashed}
.ss-tabs{position:absolute;top:-14px;right:0;left:0;display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:12px;padding:0}
.ss-tab{justify-self:end;margin-right:8px;background:#e2553d;color:#fff;font-weight:900;font-size:22px;min-width:40px;height:30px;line-height:30px;border-radius:7px;padding:0 6px}
.ss-title{font-size:12px;color:#3c5d63}
.ss-name{font-weight:900;font-size:20px;line-height:1.15;color:#123238}
.ss-end{font-size:12px;color:#3c5d63}
.ss-oneline .ss-name{font-size:34px}.ss-oneline .ss-title,.ss-oneline .ss-end{font-size:16px}
.ss-wide .ss-honoree{font-size:15px}
.ss-honoree{font-size:11px;line-height:1.35;color:#2d4a50;margin-top:5px}
.ss-open{color:#9ab3b7;font-size:16px}
@media print{
  @page{size:17in 11in;margin:0}
  body *{visibility:hidden}
  .ss-sheet,.ss-sheet *{visibility:visible}
  .ss-wrap{height:auto!important;overflow:visible}
  .ss-sheet{position:fixed;top:0;left:0;transform:none!important;box-shadow:none}
  .no-print{display:none!important}
}
`;
