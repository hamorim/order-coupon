import React, { createContext, ReactNode, useCallback, useContext } from 'react'
import { compose, graphql } from 'react-apollo'
import { useOrderForm } from 'vtex.order-manager/OrderForm'
import {
  QueueStatus,
  useOrderQueue,
  useQueueStatus,
} from 'vtex.order-manager/OrderQueue'

import InsertCoupon from 'vtex.checkout-resources/MutationInsertCoupon'

interface InsertCouponResult {
  success: boolean
  errorKey: string
}

interface Context {
  coupon?: string
  insertCoupon: (coupon: string) => Promise<InsertCouponResult>
}

interface OrderCouponProviderProps {
  children: ReactNode
  InsertCoupon: any
}

const couponKey = 'coupon'
const TASK_CANCELLED = 'TASK_CANCELLED'

const OrderCouponContext = createContext<Context | undefined>(undefined)

export const OrderCouponProvider = compose(
  graphql(InsertCoupon, { name: 'InsertCoupon' })
)(({ children, InsertCoupon }: OrderCouponProviderProps) => {
  const { enqueue, listen } = useOrderQueue()
  const { orderForm, setOrderForm } = useOrderForm()
  const coupon = orderForm.marketingData.coupon || ''

  const queueStatusRef = useQueueStatus(listen)

  const insertCoupon = useCallback(
    async (coupon: string) => {
      const task = async () => {
        const {
          data: { insertCoupon: newOrderForm },
        } = await InsertCoupon({
          variables: {
            text: coupon,
          },
        })

        return newOrderForm
      }

      try {
        const newOrderForm = await enqueue(task, couponKey)
        let errorKey = ''
        if (queueStatusRef.current === QueueStatus.FULFILLED) {
          setOrderForm(newOrderForm)
        }

        if (newOrderForm.messages.couponMessages.length) {
          const [couponMessage] = newOrderForm.messages.couponMessages
          errorKey = couponMessage.code
        }

        return {
          success: !!(
            newOrderForm.marketingData && newOrderForm.marketingData.coupon
          ),
          errorKey,
        }
      } catch (error) {
        if (!error || error.code !== TASK_CANCELLED) {
          throw error
        }
        return { success: false, errorKey: '' }
      }
    },
    [InsertCoupon, enqueue, queueStatusRef, setOrderForm]
  )

  return (
    <OrderCouponContext.Provider
      value={{
        coupon,
        insertCoupon,
      }}
    >
      {children}
    </OrderCouponContext.Provider>
  )
})

export const useOrderCoupon = () => {
  const context = useContext(OrderCouponContext)
  if (context === undefined) {
    throw new Error('useOrderCoupon must be used within a OrderCouponProvider')
  }

  return context
}

export default { OrderCouponProvider, useOrderCoupon }
