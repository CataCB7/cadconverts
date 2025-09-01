; Simple plot-to-PDF for Model Space using DWG To PDF.pc3
(defun c:CC_PLOT2PDF (/)
  (if (not (findfile "DWG To PDF.pc3"))
    (princ "\nDWG To PDF.pc3 not found, using default device.")
  )
  (setvar "BACKGROUNDPLOT" 0)
  (command
    "-plot" "y" ""                         ; detailed plot, yes, current layout
    "DWG To PDF.pc3"                       ; device
    "ANSI_A_(8.50_x_11.00_Inches)"         ; paper size (adjust as needed)
    "Inches"                               ; unit
    "Landscape"                            ; orientation
    "No"                                   ; plot upside down
    "Extents"                              ; plot area
    "Fit"                                  ; fit to paper
    "Center"                               ; center plot
    "Yes"                                  ; plot with plot styles
    "monochrome.ctb"                       ; style table
    "Yes"                                  ; lineweights
    ""                                     ; default scale
    "Yes"                                  ; save changes to layout
    "result.pdf"                           ; output file (DA uploads this)
    "Yes"                                  ; overwrite
    "No"                                   ; no more sheets
  )
  (princ)
)
(princ)
