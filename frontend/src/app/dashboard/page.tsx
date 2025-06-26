'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, where, onSnapshot, DocumentData, Timestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { PaymentButton } from '@/components/PaymentButton';
import { v4 as uuidv4 } from 'uuid';

interface Product {
  id: string;
  name: string;
  price: number;
  status: 'pending' | 'approved' | 'live' | 'closed';
  createdAt: Timestamp;
}

export default function DashboardPage() {
  const [user, loading] = useAuthState(auth);
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push('/auth/login');
      return;
    }

    const q = query(collection(db, 'products'), where('sellerId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const productsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as Product));
      setProducts(productsData);
      setIsLoadingProducts(false);
    }, (error) => {
        console.error('상품 데이터 로딩 오류:', error);
        setIsLoadingProducts(false);
    });

    return () => unsubscribe();
  }, [user, loading, router]);
  
  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return '승인 대기중';
      case 'approved': return '결제 대기중';
      case 'live': return '캠페인 진행중';
      case 'closed': return '마감';
      default: return '알 수 없음';
    }
  };

  if (loading || isLoadingProducts) return <p>데이터를 불러오는 중입니다...</p>;

  return (
    <div>
      <h1>내 상품 관리 대시보드</h1>
      <button onClick={() => router.push('/products/register')}>+ 새 상품 등록하기</button>
      <hr />
      {products.length === 0 ? (<p>등록된 상품이 없습니다.</p>) : (
        <table>
          <thead>
            <tr><th>상품명</th><th>가격</th><th>등록일</th><th>상태</th><th>액션</th></tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id}>
                <td>{product.name}</td>
                <td>{product.price.toLocaleString()}원</td>
                <td>{product.createdAt.toDate().toLocaleDateString()}</td>
                <td>{getStatusText(product.status)}</td>
                <td>
                  {product.status === 'approved' && (
                    <PaymentButton
                      price={product.price}
                      orderId={uuidv4()}
                      orderName={product.name}
                      productId={product.id}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
