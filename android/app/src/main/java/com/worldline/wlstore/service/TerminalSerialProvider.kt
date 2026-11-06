package com.worldline.wlstore.service

import android.util.Log
import CTOS.CtSystem

/**
 * Reads the terminal's factory serial number directly from the Castles CTOS
 * vendor SDK (see docs/POS_SUPPORT.md). This is the same serial number
 * printed on the sticker on the back of the device — the one an admin
 * manually types into the Device Master page (TerminalMaster.serialNo) —
 * so the Android app never needs a manual Serial No / TID entry screen: it
 * reads its own serial and sends only that to the backend.
 *
 * Only works on genuine Castles CTOS hardware (e.g. SATURN series) — the
 * underlying AIDL system service doesn't exist on emulators or non-Castles
 * devices, so callers must handle a null result.
 */
object TerminalSerialProvider {
    private const val TAG = "TerminalSerialProvider"

    /**
     * Returns the factory serial number (matches the terminal's back sticker),
     * or null if the CTOS system service isn't available (e.g. emulator) or
     * the read failed for any reason. Safe to call from a background thread;
     * the underlying binder call can block.
     */
    fun readFactorySerialNumber(): String? {
        return try {
            val ctSystem = CtSystem()
            val serial = ctSystem.getFactorySNEx()
            if (serial.isNullOrBlank()) null else serial.trim()
        } catch (e: Throwable) {
            // CtSystemException, RemoteException, UnsatisfiedLinkError, or any
            // other binder failure when the CTOS system service isn't present.
            Log.w(TAG, "Unable to read CTOS factory serial number: ${e.message}")
            null
        }
    }
}
