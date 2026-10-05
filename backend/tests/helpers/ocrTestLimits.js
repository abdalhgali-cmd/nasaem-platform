// Imported BEFORE the app/OCR module (ES imports evaluate in order) so the OCR
// limits read these small test values: a 4 MP pixel cap and a 1000 px long edge.
process.env.OCR_MAX_INPUT_PIXELS = "4000000";
process.env.OCR_MAX_DIMENSION = "1000";
