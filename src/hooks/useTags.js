import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return []
      const { data, error } = await supabase
        .from('tags')
        .select('*')
        .eq('user_id', user.id)
        .order('name')
      if (error) throw error
      return data
    },
    staleTime: 1000 * 60 * 10,
  })
}

export function useCreateTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, color = '#0F766E' }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .from('tags')
        .insert({ name: name.trim().toLowerCase(), color, user_id: user.id })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tags'] }),
    onError: (err) => {
      if (err.code === '23505') toast.error('Tag already exists')
      else toast.error(`Failed to create tag: ${err.message}`)
    },
  })
}

export function useUpdateTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, name, color }) => {
      const updates = {}
      if (name) updates.name = name.trim().toLowerCase()
      if (color) updates.color = color
      const { data, error } = await supabase.from('tags').update(updates).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags'] })
      qc.invalidateQueries({ queryKey: ['books'] })
    },
  })
}

export function useDeleteTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('tags').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags'] })
      qc.invalidateQueries({ queryKey: ['books'] })
      toast.success('Tag deleted')
    },
  })
}

export function useReadingGoal(year) {
  return useQuery({
    queryKey: ['reading_goal', year],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null
      const { data } = await supabase
        .from('reading_goals')
        .select('*')
        .eq('user_id', user.id)
        .eq('year', year)
        .maybeSingle()
      return data
    },
  })
}

export function useSetReadingGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ year, target }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .from('reading_goals')
        .upsert({ user_id: user.id, year, target })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['reading_goal', data.year] })
      toast.success('Reading goal saved')
    },
  })
}
