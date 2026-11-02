package com.example.aicamerastudio.camera.beauty

/**
 * Point indices of the 468 point face mesh (Google MediaPipe Face Mesh topology), checked by drawing
 * them on a real face photo. "Right" and "left" are the person's own sides.
 */
object FaceMesh {
    const val POINTS = 468
    val OVAL = intArrayOf(10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109)
    val LIPS_OUTER = intArrayOf(61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185)
    val LIPS_INNER = intArrayOf(78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191)
    val RIGHT_EYE = intArrayOf(33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246)
    val LEFT_EYE = intArrayOf(263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466)
    val RIGHT_BROW = intArrayOf(70, 63, 105, 66, 107, 55, 65, 52, 53, 46)
    val LEFT_BROW = intArrayOf(300, 293, 334, 296, 336, 285, 295, 282, 283, 276)

    const val RIGHT_EYE_OUTER = 33; const val LEFT_EYE_OUTER = 263
    const val RIGHT_EYE_INNER = 133; const val LEFT_EYE_INNER = 362
    const val RIGHT_LOWER_LID = 145; const val LEFT_LOWER_LID = 374
    const val NOSE_TIP = 1; const val NOSE_BRIDGE = 6; const val FOREHEAD = 151; const val CHIN = 152
    const val RIGHT_CHEEK = 205; const val LEFT_CHEEK = 425
    const val RIGHT_CHEEKBONE = 116; const val LEFT_CHEEKBONE = 345
    const val RIGHT_NOSE_SIDE = 129; const val LEFT_NOSE_SIDE = 358
    const val RIGHT_JAW = 172; const val LEFT_JAW = 397
    const val RIGHT_FACE_EDGE = 234; const val LEFT_FACE_EDGE = 454
}
