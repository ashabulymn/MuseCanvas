'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/services/api'
import type { UserProfile } from '@/shared/types'

export const ACCOUNT_QUERY_KEY = ['account'] as const

export function useAccountQuery() {
  return useQuery({
    queryKey: ACCOUNT_QUERY_KEY,
    queryFn: async () => {
      const res = await api.getMe()
      if (!res.success || !res.data) {
        throw new Error(res.error?.message || 'Failed to load user account')
      }
      return res.data as UserProfile
    },
  })
}
