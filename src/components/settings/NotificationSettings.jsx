import { useState, useEffect } from 'react'
import { Bell, BellOff, Clock, BookOpen, Sparkles, Target, Zap, Calendar } from 'lucide-react'
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

function ToggleRow({ icon, label, description, enabled, onToggle }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="text-teal-600 dark:text-teal-400 mt-0.5 flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink-800 dark:text-ink-200">{label}</p>
        {description && (
          <p className="text-xs text-ink-500 dark:text-ink-400 mt-0.5">{description}</p>
        )}
      </div>
      <button
        onClick={onToggle}
        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
          enabled ? 'bg-teal-600' : 'bg-ink-300 dark:bg-ink-600'
        }`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
            enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )
}

function TimePicker({ hour, minute, onChange, label }) {
  const formatTime = (h, m) => {
    const period = h >= 12 ? 'PM' : 'AM'
    const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${displayHour}:${String(m).padStart(2, '0')} ${period}`
  }

  return (
    <div className="flex items-center gap-2 ml-9 pb-2">
      <Clock size={13} className="text-ink-400" />
      <span className="text-xs text-ink-500 dark:text-ink-400">{label}</span>
      <input
        type="time"
        value={`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`}
        onChange={(e) => {
          const [h, m] = e.target.value.split(':').map(Number)
          onChange(h, m)
        }}
        className="text-xs bg-paper-100 dark:bg-ink-700 text-ink-800 dark:text-ink-200 rounded-lg px-2 py-1 border-0"
        style={{ fontSize: '16px' }} // prevent iOS zoom
      />
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

    // If turning on any toggle, ensure we have permission
    if (value === true) {
      const granted = await requestPermission()
      if (!granted) {
        // Revert the toggle
        const reverted = { ...settings, [key]: false }
        setSettings(reverted)
        saveNotificationSettings(reverted)
        toast.error('Notification permission denied. Enable in Settings app.')
        return
      }
      setHasPermission(true)
    }

    // Reschedule based on new settings
    await rescheduleAllNotifications({ books, highlights, goal })

    // If turning off specific notifications, cancel them
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
    <div className="card p-6 space-y-1">
      <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-paper-50 flex items-center gap-2 mb-2">
        {anyEnabled ? <Bell size={18} className="text-teal-600" /> : <BellOff size={18} className="text-ink-400" />}
        Notifications
      </h2>

      {!hasPermission && anyEnabled && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
          Notifications are disabled in system settings.
        </p>
      )}

      <ToggleRow
        icon={<BookOpen size={16} />}
        label="Daily reading reminder"
        description="Gentle nudge to pick up your current book"
        enabled={settings.readingReminder}
        onToggle={() => updateSetting('readingReminder', !settings.readingReminder)}
      />
      {settings.readingReminder && (
        <TimePicker
          hour={settings.readingReminderHour}
          minute={settings.readingReminderMinute}
          onChange={(h, m) => updateTime('readingReminderHour', 'readingReminderMinute', h, m)}
          label="Remind at"
        />
      )}

      <ToggleRow
        icon={<Sparkles size={16} />}
        label="Highlight of the day"
        description="A random Kindle highlight delivered each morning"
        enabled={settings.highlightOfDay}
        onToggle={() => updateSetting('highlightOfDay', !settings.highlightOfDay)}
      />
      {settings.highlightOfDay && (
        <TimePicker
          hour={settings.highlightHour}
          minute={settings.highlightMinute}
          onChange={(h, m) => updateTime('highlightHour', 'highlightMinute', h, m)}
          label="Deliver at"
        />
      )}

      <ToggleRow
        icon={<Target size={16} />}
        label="Goal milestones"
        description="Celebrate when you hit 25%, 50%, 75%, and 100% of your reading goal"
        enabled={settings.goalMilestones}
        onToggle={() => updateSetting('goalMilestones', !settings.goalMilestones)}
      />

      <ToggleRow
        icon={<Zap size={16} />}
        label="Kindle sync reminder"
        description="Weekly reminder if you haven't synced highlights"
        enabled={settings.kindleSyncReminder}
        onToggle={() => updateSetting('kindleSyncReminder', !settings.kindleSyncReminder)}
      />

      <ToggleRow
        icon={<Calendar size={16} />}
        label="Book anniversaries"
        description="Reminds you of books finished this month in past years"
        enabled={settings.bookAnniversary}
        onToggle={() => updateSetting('bookAnniversary', !settings.bookAnniversary)}
      />
    </div>
  )
}
