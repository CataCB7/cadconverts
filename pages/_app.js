import '../styles/global.css'
import { useEffect } from 'react'
import Nav from '../components/Nav'
import Footer from '../components/Footer'

export default function MyApp({ Component, pageProps }){
  useEffect(()=>{
    const id = process.env.NEXT_PUBLIC_GA_ID
    if(!id) return
    const s1=document.createElement('script')
    s1.async=true; s1.src=`https://www.googletagmanager.com/gtag/js?id=${id}`
    document.head.appendChild(s1)
    const s2=document.createElement('script')
    s2.innerHTML=`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id}');`
    document.head.appendChild(s2)
  },[])
  return (
    <>
      <Nav />
      <Component {...pageProps}/>
      <Footer />
    </>
  )
}
