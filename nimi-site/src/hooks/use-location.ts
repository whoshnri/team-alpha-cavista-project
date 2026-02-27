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

    const requestLocation = useCallback((): Promise<{ lat: number; lng: number }> => {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                const err = 'Geolocation not supported'
                setLocation(prev => ({ ...prev, error: err, loading: false }))
                reject(err)
                return
            }

            setLocation(prev => ({ ...prev, loading: true, error: null }))

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const { latitude, longitude } = position.coords
                    setLocation({
                        lat: latitude,
                        lng: longitude,
                        error: null,
                        loading: false,
                        permissionState: 'granted'
                    })
                    resolve({ lat: latitude, lng: longitude })
                },
                (err) => {
                    const errorMsg = err.code === 1 ? 'Location permission denied' : err.message
                    setLocation(prev => ({
                        ...prev,
                        error: errorMsg,
                        loading: false,
                        permissionState: err.code === 1 ? 'denied' : prev.permissionState
                    }))
                    reject(errorMsg)
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            )
        })
    }, [])

    // Check permission + auto-request on mount
    useEffect(() => {
        if (typeof navigator === 'undefined') return

        if (navigator.permissions) {
            navigator.permissions.query({ name: 'geolocation' }).then(result => {
                setLocation(prev => ({ ...prev, permissionState: result.state }))
                if (result.state !== 'denied') {
                    requestLocation().catch(() => { })
                } else {
                    setLocation(prev => ({ ...prev, loading: false }))
                }

                result.onchange = () => {
                    setLocation(prev => ({ ...prev, permissionState: result.state }))
                    if (result.state === 'granted') requestLocation().catch(() => { })
                }
            }).catch(() => {
                requestLocation().catch(() => { })
            })
        } else {
            requestLocation().catch(() => { })
        }
    }, [requestLocation])

    return { ...location, requestLocation }
}
