import unittest
from unittest.mock import patch
from scripts import internal_link_builder as a

class T(unittest.TestCase):
 @patch('scripts.internal_link_builder.fetch', return_value='<a href="/a/">A</a>')
 def test_suggests_unlinked_known_page(self, _):
  r=a.analyze('https://example.com',['/','/a/','/b/'])
  self.assertIn('https://example.com/b/', r['pages'][0]['suggestedLinks'])

 @patch('scripts.internal_link_builder.fetch', return_value='<a href="https://outside.example/x">X</a><a href="mailto:test@example.com">Mail</a>')
 def test_report_is_proposal_only_and_never_publishes(self, _):
  r=a.analyze('https://example.com',['/','/a/'])
  self.assertEqual('PROPOSAL_ONLY', r['mode'])
  self.assertFalse(r['publishAllowed'])

 @patch('scripts.internal_link_builder.fetch', return_value='<a href="/a/#section">A</a><a href="/a/?utm_source=x">Tracked</a>')
 def test_existing_internal_links_are_normalized(self, _):
  r=a.analyze('https://example.com',['/','/a/'])
  self.assertNotIn('https://example.com/a/', r['pages'][0]['suggestedLinks'])

 @patch('scripts.internal_link_builder.fetch', return_value='<a href="/car-accident/">Car</a>')
 def test_suggestions_are_structured_for_review(self, _):
  r=a.analyze('https://example.com',['/','/car-accident/','/dog-bite/'])
  self.assertIn('proposals', r)
  self.assertTrue(all({'source','target','reason'} <= set(x) for x in r['proposals']))

if __name__=='__main__': unittest.main()
