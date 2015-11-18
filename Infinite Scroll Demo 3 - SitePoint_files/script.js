
(function($)
{

    $(document).ready(function()
    {
          //empty top search box on click
          var searchboxEl = $('#searchform input[name=q]'),
              defaultText1 = 'eg. Ajax demos';
          searchboxEl.attr('value',defaultText1);
          searchboxEl.live('click', function()
          {
              searchboxEl.val('');
              searchboxEl.focus();
          }).live('blur', function()
          {
              searchboxEl.val(defaultText1);
          });


          //BSA
          setTimeout(function()
          {
              var close = '<a href="#" class="close_bsap">X</a>';
              $('.bsap .bsa_it').prepend(close);
              $('.close_bsap').live('click', function(e)
              {
                  e.preventDefault();
                  $(this).closest('.bsap').hide();
              });
          }, 1500);

    });

})(jQuery);