'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../ui/Button';

interface RazorpayCheckoutProps {
  jobId: string;
  cafeId: string;
  onSuccess?: () => void;
  onError?: (err: any) => void;
}

export function RazorpayCheckout({ jobId, cafeId, onSuccess, onError }: RazorpayCheckoutProps) {
  const router = useRouter();
  
  useEffect(() => {
    // Load the Razorpay script dynamically
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
    
    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  const handlePayment = async () => {
    try {
      // 1. Request Order ID from our backend
      const res = await fetch('/api/payment/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId })
      });
      
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error);

      // 2. Open Razorpay Checkout
      const options = {
        key: data.keyId,
        amount: data.amount,
        currency: data.currency,
        name: 'QR Print Cafe',
        description: `Print Job #${jobId}`,
        order_id: data.orderId,
        handler: async function (response: any) {
          // 3. Verify Payment
          const verifyRes = await fetch('/api/payment/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              jobId
            })
          });
          
          if (verifyRes.ok) {
            if (onSuccess) onSuccess();
            router.push(`/${cafeId}/status/${jobId}`);
          } else {
            if (onError) onError('Verification failed');
            alert('Payment verification failed.');
          }
        },
        theme: {
          color: '#22c55e'
        }
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', function (response: any) {
        console.error('Payment Failed:', response.error);
        if (onError) onError(response.error);
      });
      
      rzp.open();
    } catch (error) {
      console.error(error);
      alert('Could not initialize payment. Please try cash.');
      if (onError) onError(error);
    }
  };

  return (
    <Button variant="primary" onClick={handlePayment} style={{ width: '100%' }}>
      Pay Online & Print Now
    </Button>
  );
}
