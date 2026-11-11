import React from 'react';

export type FundraiserAllocationDraft = { fundraiserId: string; percentage: number };
type Fundraiser = { id: string; name: string; percentage?: number };

export const FundraiserAllocationEditor: React.FC<{ fundraisers: Fundraiser[]; value: FundraiserAllocationDraft[]; onChange: (value: FundraiserAllocationDraft[]) => void; disabled?: boolean }> = ({ fundraisers, value, onChange, disabled }) => {
  const total=value.reduce((sum,item)=>sum+Number(item.percentage||0),0);
  const update=(index:number,changes:Partial<FundraiserAllocationDraft>)=>onChange(value.map((item,itemIndex)=>itemIndex===index?{...item,...changes}:item));
  return <div style={{gridColumn:'1 / -1',background:'var(--bg-input)',border:'1px solid var(--border)',borderRadius:12,padding:14}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',marginBottom:10}}><div><strong>Fundraiser commission split</strong><div style={{fontSize:12,color:'var(--text-muted)'}}>Only received payments create commission. The payment can inherit the linked pledge split.</div></div><strong style={{color:total>100?'var(--red)':'var(--navy)'}}>{total.toFixed(2)}%</strong></div>
    <div style={{display:'grid',gap:8}}>{value.map((item,index)=><div key={index} style={{display:'grid',gridTemplateColumns:'1fr 120px auto',gap:8}}><select disabled={disabled} value={item.fundraiserId} onChange={event=>update(index,{fundraiserId:event.target.value})}><option value="">Select fundraiser</option>{fundraisers.map(fundraiser=><option key={fundraiser.id} value={fundraiser.id}>{fundraiser.name}</option>)}</select><input disabled={disabled} type="number" min="0.01" max="100" step="0.01" value={item.percentage||''} onChange={event=>update(index,{percentage:Number(event.target.value)})} placeholder="Percent"/><button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={()=>onChange(value.filter((_,itemIndex)=>itemIndex!==index))}>Remove</button></div>)}</div>
    <button type="button" className="btn btn-secondary btn-sm" style={{marginTop:10}} disabled={disabled||value.length>=fundraisers.length} onClick={()=>onChange([...value,{fundraiserId:'',percentage:30}])}>+ Add fundraiser share</button>
  </div>;
};
