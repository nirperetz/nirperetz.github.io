$(function(){var $container = 
	$('.posts').css({
		opacity: 0
	});
	$container.imagesLoaded(function(){
		$container.animate({
			opacity: 1
		});
		$container.masonry({
			itemSelector: '.post',
			columnWidth: 260
		});
	});
	$container.infinitescroll({
		navSelector: '.pagination',
		nextSelector: '.pagination li a.pagination_nextlink',
		itemSelector: '.post',
		loading: {
			img: 'white-90perc-opacity.png',
			donetext: ''
		}},
		function( newElements ) { var $newElems =
			$( newElements ).css({ 
				opacity: 0
			});
			$newElems.imagesLoaded(function(){
				$newElems.animate({
					opacity: 1
			});
			$container.masonry( 'appended', $newElems, true );
		});
	});
});