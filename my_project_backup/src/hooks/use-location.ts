"use client"

import { useState, useEffect, useCallback } from 'react'

type LocationState = {
    lat: number | null
    lng: number | null
    error: string | null
    loading: boolean
    permissionState: PermissionState | 'unknown'
}

export function useLocation() {
    const [location, setLocation] = useState<LocationState>({
        lat: null, lng: null, error: null, loading: true, permissionState: 'unknown'
    })

    const requestLocation = useCallback(() => {
        if (!navigator.geolocation) {
            setLocation(prev => ({ ...prev, error: 'Geolocation not supported', loading: false }))
            return
        }

        setLocation(prev => ({ ...prev, loading: true, error: null }))

        navigator.geolocation.getCurrentPosition(
            (position) => {
                setLocation({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    error: null,
                    loading: false,
                    permissionState: 'granted'
                })
            },
            (err) => {
                setLocation(prev => ({
                    ...prev,
                    error: err.code === 1 ? 'Location permission denied' : err.message,
                    loading: false,
                    permissionState: err.code === 1 ? 'denied' : prev.permissionState
                }))
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
        )
    }, [])

    // Check permission + auto-request on mount
    useEffect(() => {
        if (typeof navigator === 'undefined') return

        // Check if we already have cached location
        const cached = sessionStorage.getItem('preventiq_location')
        if (cached) {
            try {
                const { lat, lng, ts } = JSON.parse(cached)
                // Use cache if less than 5 minutes old
                if (Date.now() - ts < 300000) {
                    setLocation({ lat, lng, error: null, loading: false, permissionState: 'granted' })
                    return
                }
            } catch { }
        }

        // Check permission state first if available (Chrome/Edge)
        if (navigator.permissions) {
            navigator.permissions.query({ name: 'geolocation' }).then(result => {
                setLocation(prev => ({ ...prev, permissionState: result.state }))
                if (result.state !== 'denied') {
                    requestLocation()
                } else {
                    setLocation(prev => ({ ...prev, loading: false }))
                }
            }).catch(() => {
                // Permissions API not available, just request
                requestLocation()
            })
        } else {
            requestLocation()
        }
    }, [requestLocation])

    // Cache location on change
    useEffect(() => {
        if (location.lat && location.lng) {
            sessionStorage.setItem('preventiq_location', JSON.stringify({
                lat: location.lat, lng: location.lng, ts: Date.now()
            }))
        }
    }, [location.lat, location.lng])

    return { ...location, requestLocation }
}
