'use client';
import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, DocumentData, Timestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { useRouter } from 'next/navigation';

interface Product extends DocumentData {
  id: string;
  name: string;
  sellerId: string;
  status: 'pending' | 'approved' | 'live' | 'closed';
  createdAt: Timestamp;
}

export default function AdminDashboardPage() {
  const [user, loading] = useAuthState(auth);
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push('/auth/login');
      return;
    }

    // 사용자 토큰에서 admin 클레임 확인
    user.getIdTokenResult().then((idTokenResult) => {
      if (idTokenResult.claims.admin) {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
      }
    });

  }, [user, loading, router]);


  useEffect(() => {
    if (isAdmin === false) return; // 관리자가 아니면 데이터 로드 안함
    if (isAdmin === true) {
      const q = query(collection(db, 'products'));
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const productsData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        } as Product));
        setProducts(productsData);
        setIsLoading(false);
      });
      return () => unsubscribe();
    }
  }, [isAdmin]);

  const handleStatusChange = async (productId: string, newStatus: string) => {
    try {
      const productRef = doc(db, 'products', productId);
      await updateDoc(productRef, { status: newStatus });
      alert('상태가 성공적으로 변경되었습니다.');
    } catch (error) {
      alert('상태 변경 중 오류가 발생했습니다.');
    }
  };

  if (loading || isAdmin === null) return <p>권한을 확인하는 중입니다...</p>;
  if (isAdmin === false) return <p>접근 권한이 없습니다.</p>;
  if (isLoading) return <p>관리자 데이터를 불러오는 중입니다...</p>;

  return (
    <div>
      <h1>(관리자) 전체 상품 관리</h1>
      <table>
        <thead>
          <tr><th>상품명</th><th>판매자 ID</th><th>등록일</th><th>현재 상태</th><th>상태 변경</th></tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id}>
              <td>{product.name}</td>
              <td>{product.sellerId.substring(0, 10)}...</td>
              <td>{product.createdAt.toDate().toLocaleDateString()}</td>
              <td>{product.status}</td>
              <td>
                <select 
                  value={product.status} 
                  onChange={(e) => handleStatusChange(product.id, e.target.value)}
                >
                  <option value="pending">승인 대기</option>
                  <option value="approved">승인 완료</option>
                  <option value="closed">마감</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
