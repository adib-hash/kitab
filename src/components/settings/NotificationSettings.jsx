import { useState, useEffect } from 'react'
import { Bell, BellOff, BookOpen, Sparkles, Target, Zap, Calendar } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import {
  getNotificationSettings,
  saveNotificationSettings,
  requestPermission,
  checkPermission,
  rescheduleAllNotifications,
  cancelReadingReminder,
  cancelHighlightOfDay,
} from '../../lib/notifications'
import toast from 'react-hot-toast'

function ToggleRow({ icon, label, description, enabled, onToggle, children }) {
  return (
    <div className="py-3">
      <div className="flex items-center gap-3">
        <div className="text-teal-600 dark:text-teal-400 flex-shrink-0">{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink-800 dark:text-ink-200">{label}</p>
        </div>
        <div
          role="switch"
          aria-checked={enabled}
          onClick={onToggle}
          className="relative flex-shrink-0 cursor-pointer"
          style={{
            width: 44,
            height: 26,
            borderRadius: 13,
            backgroundColor: enabled ? '#0d9488' : '#a8a29e',
            transition: 'background-color 0.2s',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 2,
              left: enabled ? 20 : 2,
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: '#fff',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              transition: 'left 0.2s',
            }}
          />
        </div>
      </div>
      {description && (
        <p className="text-xs text-ink-500 dark:text-ink-400 mt-1 ml-9">{description}</p>
      )}
      {children}
    </div>
  )
}

function TimeSelect({ hour, minute, onChange, label }) {
  const formatTime = (h, m) => {
    const period = h >= 12 ? 'PM' : 'AM'
    const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${displayHour}:${String(m).padStart(2, '0')} ${period}`
  }

  // Generate hour options
  const hours = Array.from({ length: 24 }, (_, i) => i)

  return (
    <div className="flex items-center gap-2 mt-2 ml-9">
      <span className="text-xs text-ink-500 dark:text-ink-400">{label}</span>
      <select
        value={hour}
        onChange={(e) => onChange(Number(e.target.value), minute)}
        className="text-xs bg-paper-100 dark:bg-ink-700 text-ink-800 dark:text-ink-200 rounded-lg px-2 py-1.5 border-0 appearance-none"
        style={{ fontSize: '16px' }}
      >
        {hours.map(h => (
          <option key={h} value={h}>
            {h === 0 ? '12' : h > 12 ? h - 12 : h} {h >= 12 ? 'PM' : 'AM'}
          </option>
        ))}
      </select>
    </div>
  )
}

export function NotificationSettings({ books = [], highlights = [], goal = null }) {
  const [settings, setSettings] = useState(getNotificationSettings)
  const [hasPermission, setHasPermission] = useState(false)
  const isNative = Capacitor.isNativePlatform()

  useEffect(() => {
    if (isNative) {
      checkPermission().then(setHasPermission)
    }
  }, [isNative])

  if (!isNative) return null

  async function updateSetting(key, value) {
    const updated = { ...settings, [key]: value }
    setSettings(updated)
    saveNotificationSettings(updated)

    if (value === true) {
      const granted = await requestPermission()
      if (!granted) {
        const reverted = { ...settings, [key]: false }
        setSettings(reverted)
        saveNotificationSettings(reverted)
        toast.error('Notification permission denied. Enable in Settings app.')
        return
      }
      setHasPermission(true)
    }

    await rescheduleAllNotifications({ books, highlights, goal })

    if (key === 'readingReminder' && !value) await cancelReadingReminder()
    if (key === 'highlightOfDay' && !value) await cancelHighlightOfDay()
  }

  function updateTime(hourKey, minuteKey, h, m) {
    const updated = { ...settings, [hourKey]: h, [minuteKey]: m }
    setSettings(updated)
    saveNotificationSettings(updated)
    rescheduleAllNotifications({ books, highlights, goal })
  }

  const anyEnabled = settings.readingReminder || settings.highlightOfDay ||
    settings.goalMilestones || settings.kindleSyncReminder || settings.bookAnniversary

  return (
    <div className="card p-6 space-y-4">
      <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-paper-50 flex items-center gap-2">
        {anyEnabled ? <Bell size={18} className="text-teal-600" /> : <BellOff size={18} className="text-ink-400" />}
        Notifications
      </h2>

      {!hasPermission && anyEnabled && (
        <p className="text-xs text-amber-600 dark:text-amber-400 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20">
          Notifications are disabled in system settings.
        </p>
      )}

      <div className="divide-y divide-paper-200 dark:divide-ink-700">
        <ToggleRow
          icon={<BookOpen size={16} />}
          label="Daily reading reminder"
          description="Nudge to pick up your current book"
          enabled={settings.readingReminder}
          onToggle={() => updateSetting('readingReminder', !settings.readingReminder)}
        >
          {settings.readingReminder && (
            <TimeSelect
              hour={settings.readingReminderHour}
              minute={settings.readingReminderMinute}
              onChange={(h, m) => updateTime('readingReminderHour', 'readingReminderMinute', h, m)}
              label="Remind at"
            />
          )}
        </ToggleRow>

        <ToggleRow
          icon={<Sparkles size={16} />}
          label="Highlight of the day"
          description="A random Kindle highlight each morning"
          enabled={settings.highlightOfDay}
          onToggle={() => updateSetting('highlightOfDay', !settings.highlightOfDay)}
        >
          {settings.highlightOfDay && (
            <TimeSelect
              hour={settings.highlightHour}
              minute={settings.highlightMinute}
              onChange={(h, m) => updateTime('highlightHour', 'highlightMinute', h, m)}
              label="Deliver at"
            />
          )}
        </ToggleRow>

        <ToggleRow
          icon={<Target size={16} />}
          label="Goal milestones"
          description="Celebrate at 25%, 50%, 75%, and 100%"
          enabled={settings.goalMilestones}
          onToggle={() => updateSetting('goalMilestones', !settings.goalMilestones)}
        />

        <ToggleRow
          icon={<Zap size={16} />}
          label="Kindle sync reminder"
          description="Weekly reminder to sync highlights"
          enabled={settings.kindleSyncReminder}
          onToggle={() => updateSetting('kindleSyncReminder', !settings.kindleSyncReminder)}
        />

        <ToggleRow
          icon={<Calendar size={16} />}
          label="Book anniversaries"
          description="Books finished this month in past years"
          enabled={settings.bookAnniversary}
          onToggle={() => updateSetting('bookAnniversary', !settings.bookAnniversary)}
        />
      </div>
    </div>
  )
}
