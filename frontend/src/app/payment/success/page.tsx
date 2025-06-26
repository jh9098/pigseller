'use client'
import { useSearchParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function PaymentSuccessPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [message, setMessage] = useState('결제 승인 중...')

  useEffect(() => {
    const paymentKey = searchParams.get('paymentKey')
    const orderId = searchParams.get('orderId')
    const amount = searchParams.get('amount')
    const productId = searchParams.get('productId')

    if (!paymentKey || !orderId || !amount || !productId) {
      setMessage('잘못된 결제 요청입니다.')
      return
    }

    // Here we would call Firebase Function confirmTossPayment
    setTimeout(() => {
      setMessage('결제가 성공적으로 완료되었습니다!')
      router.push('/dashboard')
    }, 1000)
  }, [searchParams, router])

  return (
    <div>
      <h1>결제 결과</h1>
      <p>{message}</p>
    </div>
  )
}
