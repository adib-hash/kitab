import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

// Fetch all saved recommendation sessions for the user
export function useRecommendations() {
  return useQuery({
    queryKey: ['recommendations'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return []
      const { data, error } = await supabase
        .from('recommendations')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    staleTime: 1000 * 60 * 5,
  })
}

// Save a new recommendation session
export function useSaveRecommendation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ mode, query, books }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .from('recommendations')
        .insert({ user_id: user.id, mode, query, books })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recommendations'] }),
    onError: (err) => toast.error(`Couldn't save recommendations: ${err.message}`),
  })
}

// Delete a recommendation session
export function useDeleteRecommendation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('recommendations').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recommendations'] })
      toast.success('Recommendation removed')
    },
    onError: (err) => toast.error(`Failed to delete: ${err.message}`),
  })
}
