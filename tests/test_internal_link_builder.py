import unittest
from unittest.mock import patch
from scripts import internal_link_builder as a
class T(unittest.TestCase):
 @patch('scripts.internal_link_builder.fetch',return_value='<a href="/a/">A</a>')
 def test_suggests_unlinked_known_page(self,_):
  r=a.analyze('https://example.com',['/','/a/','/b/']); self.assertIn('https://example.com/b/',r['pages'][0]['suggestedLinks'])
if __name__=='__main__':unittest.main()
