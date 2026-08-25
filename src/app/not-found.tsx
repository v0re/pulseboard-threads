import Link from "next/link";

export default function NotFound() {
  return <main style={{ minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"#f4f3ef" }}><section style={{ textAlign:"center" }}><p style={{ fontSize:11,color:"#817cff",marginBottom:10 }}>404</p><h1 style={{ fontSize:28,marginBottom:8 }}>找不到這個頁面</h1><Link href="/" style={{ display:"inline-block",marginTop:14,background:"#1c1b1f",color:"#fff",borderRadius:10,padding:"10px 15px",fontSize:12 }}>返回總覽</Link></section></main>;
}
