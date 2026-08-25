"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main style={{ minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"#f4f3ef" }}><section style={{ maxWidth:520,background:"#fff",border:"1px solid #e2dfd7",borderRadius:18,padding:28,textAlign:"center" }}><p style={{ fontSize:10,letterSpacing:".15em",color:"#817cff",marginBottom:12 }}>PULSEBOARD</p><h1 style={{ fontSize:24,marginBottom:10 }}>暫時無法顯示資料</h1><p style={{ color:"#77727c",fontSize:13,lineHeight:1.6,marginBottom:18 }}>可能是資料庫或 Threads API 暫時無法使用。憑證與錯誤細節不會顯示在這裡。</p><button onClick={reset} style={{ border:0,borderRadius:10,background:"#1c1b1f",color:"white",padding:"10px 16px",cursor:"pointer" }}>再試一次</button></section></main>;
}
