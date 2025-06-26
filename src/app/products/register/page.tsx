'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, SubmitHandler } from 'react-hook-form';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';

type ProductInputs = {
  name: string;
  description: string;
  price: number;
  productImage: FileList;
};

export default function RegisterProductPage() {
  const [user, loading] = useAuthState(auth);
  const router = useRouter();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ProductInputs>();
  const [formError, setFormError] = useState('');

  if (loading) return <p>로딩 중...</p>;
  if (!user) {
    router.push('/auth/login');
    return null;
  }

  const onSubmit: SubmitHandler<ProductInputs> = async (data) => {
    setFormError('');
    if (!data.productImage || data.productImage.length === 0) {
      setFormError('상품 이미지를 등록해주세요.');
      return;
    }

    try {
      const imageFile = data.productImage[0];
      const storageRef = ref(storage, `products/${user.uid}/${Date.now()}_${imageFile.name}`);
      const uploadResult = await uploadBytes(storageRef, imageFile);
      const imageUrl = await getDownloadURL(uploadResult.ref);

      await addDoc(collection(db, 'products'), {
        sellerId: user.uid,
        name: data.name,
        description: data.description,
        price: Number(data.price),
        imageUrl: imageUrl,
        status: 'pending', // 초기 상태: 승인대기
        createdAt: serverTimestamp(),
      });

      alert('상품이 성공적으로 등록되었습니다. 관리자 승인 후 결제가 가능합니다.');
      router.push('/dashboard');

    } catch (err: any) {
      setFormError('상품 등록 중 오류 발생: ' + err.message);
    }
  };

  return (
    <div>
      <h1>상품 등록</h1>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div>
          <label htmlFor="name">상품명</label>
          <input id="name" {...register('name', { required: '상품명은 필수입니다.' })} />
          {errors.name && <p style={{ color: 'red' }}>{errors.name.message}</p>}
        </div>
        <div>
          <label htmlFor="description">상품 설명</label>
          <textarea id="description" {...register('description', { required: '상품 설명은 필수입니다.' })} />
          {errors.description && <p style={{ color: 'red' }}>{errors.description.message}</p>}
        </div>
        <div>
          <label htmlFor="price">결제 금액 (숫자만 입력)</label>
          <input id="price" type="number" {...register('price', { required: '가격은 필수입니다.', valueAsNumber: true })} />
          {errors.price && <p style={{ color: 'red' }}>{errors.price.message}</p>}
        </div>
        <div>
          <label htmlFor="productImage">대표 이미지</label>
          <input id="productImage" type="file" accept="image/*" {...register('productImage', { required: '이미지는 필수입니다.' })} />
          {errors.productImage && <p style={{ color: 'red' }}>{errors.productImage.message}</p>}
        </div>
        {formError && <p style={{ color: 'red' }}>{formError}</p>}
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? '등록 중...' : '상품 등록하기'}
        </button>
      </form>
    </div>
  );
}
