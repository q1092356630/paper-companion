import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location("prepare",Path(__file__).parents[1]/"desktop/pdf-prepare.py")
prepare=importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)

class ReadingOrderTests(unittest.TestCase):
    def test_ocr_rows_are_reordered_into_columns_below_spanning_title(self):
        rows=[(50,20,550,40,'Title'),(50,60,285,70,'Left 1'),(320,60,550,70,'Right 1'),(50,80,285,90,'Left 2'),(320,80,550,90,'Right 2')]
        self.assertEqual([x[4] for x in prepare.reading_order(rows,600)],['Title','Left 1','Left 2','Right 1','Right 2'])
    def test_spanning_heading_separates_reading_bands(self):
        rows=[(50,60,285,70,'L1'),(320,60,550,70,'R1'),(50,100,550,120,'Section'),(50,140,285,150,'L2'),(320,140,550,150,'R2')]
        self.assertEqual([x[4] for x in prepare.reading_order(rows,600)],['L1','R1','Section','L2','R2'])

if __name__=='__main__':unittest.main()
