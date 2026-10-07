import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {title:"수식로드 · 야외 수학 탐험",description:"휴대폰으로 카드를 모으고 모둠의 수식로드를 완성하는 야외 수학 수업",robots:{index:false,follow:false},referrer:"no-referrer",icons:{icon:"/favicon.svg",shortcut:"/favicon.svg"}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="ko"><body>{children}</body></html>;}
